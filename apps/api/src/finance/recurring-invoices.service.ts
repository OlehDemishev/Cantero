import { Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { Prisma } from "@prisma/client";
import type { CreateRecurringInvoiceInput, UpdateRecurringInvoiceInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import { RECURRING_INVOICES_QUEUE } from "../common/queue/queue.module";
import { advanceDate, calculateRecurringInvoice } from "./recurring-invoice-schedule";

const RECURRING_INVOICES_CHECK_INTERVAL_MS = 60 * 60 * 1000;

type RecurringInvoiceWithLines = Prisma.RecurringInvoiceGetPayload<{ include: { lines: true } }>;

@Injectable()
export class RecurringInvoicesService implements OnModuleInit {
  private readonly logger = new Logger(RecurringInvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
    @InjectQueue(RECURRING_INVOICES_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    // Same jobId + repeat options on every boot — BullMQ dedupes rather than stacking repeats.
    await this.queue.add(
      "run-due",
      {},
      { repeat: { every: RECURRING_INVOICES_CHECK_INTERVAL_MS }, jobId: "recurring-invoices-repeat" },
    );
  }

  list(companyId: string) {
    return this.prisma.recurringInvoice.findMany({
      where: { companyId },
      include: { lines: { orderBy: { sortOrder: "asc" } }, project: true, client: true },
      orderBy: { createdAt: "desc" },
    });
  }

  get(companyId: string, id: string) {
    return this.findOrThrow(companyId, id);
  }

  async create(companyId: string, actor: AuditActor, input: CreateRecurringInvoiceInput) {
    const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    const client = await this.prisma.client.findFirst({ where: { id: input.clientId, companyId } });
    if (!client) throw new NotFoundException("Client not found");

    const startDate = new Date(input.startDate);
    const recurring = await this.prisma.recurringInvoice.create({
      data: {
        companyId,
        projectId: input.projectId,
        clientId: input.clientId,
        name: input.name,
        frequency: input.frequency,
        taxPercent: input.taxPercent,
        startDate,
        nextRunDate: startDate,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        lines: {
          create: input.lines.map((l, i) => ({
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            sortOrder: i,
          })),
        },
      },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    this.audit.record(
      companyId,
      actor,
      "recurring_invoice.created",
      "RecurringInvoice",
      recurring.id,
      `Created recurring invoice "${input.name}" (${input.frequency})`,
    );
    return recurring;
  }

  async update(companyId: string, actor: AuditActor, id: string, input: UpdateRecurringInvoiceInput) {
    const existing = await this.findOrThrow(companyId, id);

    if (input.lines) {
      await this.prisma.$transaction([
        this.prisma.recurringInvoiceLine.deleteMany({ where: { recurringInvoiceId: id } }),
        this.prisma.recurringInvoiceLine.createMany({
          data: input.lines.map((l, i) => ({
            recurringInvoiceId: id,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            sortOrder: i,
          })),
        }),
      ]);
    }

    const updated = await this.prisma.recurringInvoice.update({
      where: { id },
      data: {
        name: input.name,
        frequency: input.frequency,
        taxPercent: input.taxPercent,
        endDate: input.endDate === undefined ? undefined : input.endDate ? new Date(input.endDate) : null,
        active: input.active,
      },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    this.audit.record(
      companyId,
      actor,
      "recurring_invoice.updated",
      "RecurringInvoice",
      id,
      `Updated recurring invoice "${existing.name}"`,
    );
    return updated;
  }

  async setActive(companyId: string, actor: AuditActor, id: string, active: boolean) {
    const existing = await this.findOrThrow(companyId, id);
    await this.prisma.recurringInvoice.update({ where: { id }, data: { active } });
    this.audit.record(
      companyId,
      actor,
      active ? "recurring_invoice.resumed" : "recurring_invoice.paused",
      "RecurringInvoice",
      id,
      `${active ? "Resumed" : "Paused"} recurring invoice "${existing.name}"`,
    );
    return this.findOrThrow(companyId, id);
  }

  async delete(companyId: string, actor: AuditActor, id: string) {
    const existing = await this.findOrThrow(companyId, id);
    await this.prisma.recurringInvoice.delete({ where: { id } });
    this.audit.record(
      companyId,
      actor,
      "recurring_invoice.deleted",
      "RecurringInvoice",
      id,
      `Deleted recurring invoice "${existing.name}"`,
    );
    return { ok: true };
  }

  /** Manually generates the next invoice immediately, ahead of schedule, and advances nextRunDate as if the scheduled pass had run. */
  async generateNow(companyId: string, actor: AuditActor, id: string) {
    const recurring = await this.findOrThrow(companyId, id);
    const invoice = await this.generateInvoice(recurring);
    this.audit.record(
      companyId,
      actor,
      "recurring_invoice.generated",
      "RecurringInvoice",
      id,
      `Manually generated invoice ${invoice.number} from "${recurring.name}"`,
    );
    return invoice;
  }

  /** Runs on the periodic queue tick: every active template due (nextRunDate <= now) across every company generates its next invoice. */
  async runDuePass(): Promise<{ generated: number }> {
    const due = await this.prisma.recurringInvoice.findMany({
      where: { active: true, nextRunDate: { lte: new Date() } },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });

    let generated = 0;
    for (const recurring of due) {
      if (recurring.endDate && recurring.nextRunDate > recurring.endDate) {
        await this.prisma.recurringInvoice.update({ where: { id: recurring.id }, data: { active: false } });
        continue;
      }
      try {
        await this.generateInvoice(recurring);
        generated++;
      } catch (err) {
        this.logger.warn(`Failed to generate recurring invoice ${recurring.id}: ${(err as Error).message ?? err}`);
      }
    }
    return { generated };
  }

  private async generateInvoice(recurring: RecurringInvoiceWithLines) {
    const invoiceCount = await this.prisma.invoice.count({ where: { companyId: recurring.companyId } });
    const number = `INV-${String(invoiceCount + 1).padStart(4, "0")}`;

    const calc = calculateRecurringInvoice(
      recurring.lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
      Number(recurring.taxPercent),
    );

    const invoice = await this.prisma.invoice.create({
      data: {
        companyId: recurring.companyId,
        projectId: recurring.projectId,
        clientId: recurring.clientId,
        recurringInvoiceId: recurring.id,
        number,
        status: "draft",
        subtotal: calc.subtotal,
        taxAmount: calc.taxAmount,
        total: calc.total,
        lines: {
          create: calc.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
          })),
        },
      },
      include: { lines: true, client: true, project: true },
    });

    await this.prisma.recurringInvoice.update({
      where: { id: recurring.id },
      data: { nextRunDate: advanceDate(recurring.nextRunDate, recurring.frequency), lastGeneratedAt: new Date() },
    });

    this.webhooks.trigger(recurring.companyId, "invoice.recurring_generated", {
      invoiceId: invoice.id,
      number: invoice.number,
      recurringInvoiceId: recurring.id,
    });

    return invoice;
  }

  private async findOrThrow(companyId: string, id: string) {
    const recurring = await this.prisma.recurringInvoice.findFirst({
      where: { id, companyId },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!recurring) throw new NotFoundException("Recurring invoice not found");
    return recurring;
  }
}
