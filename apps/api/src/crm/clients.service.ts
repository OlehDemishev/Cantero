import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CLIENT_STAGES,
  type AddClientActivityInput,
  type AddClientReminderInput,
  type ConvertClientToProjectInput,
  type CreateClientInput,
  type ImportResult,
  type MoveClientStageInput,
  type UpdateClientInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { parseCsvRecords } from "../common/csv";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
    private readonly projects: ProjectsService,
  ) {}

  list(companyId: string) {
    return this.prisma.client.findMany({
      where: { companyId },
      include: { owner: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });
  }

  async get(companyId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, companyId },
      include: { owner: { select: { id: true, name: true } } },
    });
    if (!client) throw new NotFoundException("Client not found");
    return client;
  }

  async create(companyId: string, input: CreateClientInput) {
    if (input.ownerWorkerId) await this.assertWorker(companyId, input.ownerWorkerId);
    return this.prisma.client.create({ data: { ...input, companyId } });
  }

  async update(companyId: string, id: string, input: UpdateClientInput) {
    await this.get(companyId, id);
    if (input.ownerWorkerId) await this.assertWorker(companyId, input.ownerWorkerId);
    return this.prisma.client.update({ where: { id }, data: input });
  }

  /** Stage transitions are the only path to won/lost — this is where wonAt/lostAt/lostReason and audit/webhooks live. */
  async moveStage(companyId: string, actor: AuditActor, id: string, input: MoveClientStageInput) {
    const client = await this.get(companyId, id);
    if (client.stage === input.stage) throw new BadRequestException(`Client is already in stage "${input.stage}"`);

    const updated = await this.prisma.client.update({
      where: { id: client.id },
      data: {
        stage: input.stage,
        wonAt: input.stage === "won" ? new Date() : null,
        lostAt: input.stage === "lost" ? new Date() : null,
        lostReason: input.stage === "lost" ? input.lostReason : null,
      },
      include: { owner: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "client.stage_changed", "Client", client.id, `Moved "${client.name}" to ${input.stage}`);
    if (input.stage === "won") this.webhooks.trigger(companyId, "client.won", { clientId: client.id, name: client.name });
    if (input.stage === "lost") this.webhooks.trigger(companyId, "client.lost", { clientId: client.id, name: client.name });
    return updated;
  }

  async convertToProject(companyId: string, actor: AuditActor, id: string, input: ConvertClientToProjectInput) {
    const client = await this.get(companyId, id);
    if (client.stage !== "won") throw new BadRequestException("Only a won client can be converted to a project");

    const project = await this.projects.create(companyId, { name: input.name, address: input.address, clientId: client.id });
    this.audit.record(companyId, actor, "client.converted_to_project", "Client", client.id, `Converted "${client.name}" to project "${project.name}"`);
    return project;
  }

  /** Deal count + total estimated value per stage, in pipeline order — the CRM board's summary strip. */
  async pipelineSummary(companyId: string) {
    const clients = await this.prisma.client.findMany({
      where: { companyId },
      select: { stage: true, estimatedValue: true },
    });
    return CLIENT_STAGES.map((stage) => {
      const inStage = clients.filter((c) => c.stage === stage);
      return {
        stage,
        count: inStage.length,
        totalValue: inStage.reduce((sum, c) => sum + Number(c.estimatedValue ?? 0), 0),
      };
    });
  }

  private async assertWorker(companyId: string, workerId: string) {
    const worker = await this.prisma.worker.findFirst({ where: { id: workerId, companyId } });
    if (!worker) throw new BadRequestException("Owner does not belong to this company");
    return worker;
  }

  /** CSV columns: name (required), email, phone. */
  async importCsv(companyId: string, actor: AuditActor, csv: string): Promise<ImportResult> {
    const records = parseCsvRecords(csv);
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };
    const toCreate: { name: string; email: string | null; phone: string | null }[] = [];

    records.forEach((record, index) => {
      const row = index + 2; // header is row 1
      const name = record.name?.trim();
      if (!name) {
        result.skipped++;
        result.errors.push({ row, message: "Missing name" });
        return;
      }
      toCreate.push({ name, email: record.email?.trim() || null, phone: record.phone?.trim() || null });
    });

    if (toCreate.length > 0) {
      await this.prisma.client.createMany({ data: toCreate.map((c) => ({ ...c, companyId })) });
      result.created = toCreate.length;
    }

    this.audit.record(
      companyId,
      actor,
      "clients.imported",
      "Client",
      companyId,
      `Imported ${result.created} clients from CSV (${result.skipped} skipped)`,
    );

    return result;
  }

  async listActivities(companyId: string, clientId: string) {
    await this.get(companyId, clientId);
    return this.prisma.clientActivity.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } });
  }

  async addActivity(companyId: string, clientId: string, input: AddClientActivityInput) {
    await this.get(companyId, clientId);
    return this.prisma.clientActivity.create({
      data: { companyId, clientId, type: input.type, content: input.content },
    });
  }

  async listReminders(companyId: string, clientId: string) {
    await this.get(companyId, clientId);
    return this.prisma.clientReminder.findMany({ where: { clientId }, orderBy: { dueDate: "asc" } });
  }

  async addReminder(companyId: string, clientId: string, input: AddClientReminderInput) {
    await this.get(companyId, clientId);
    return this.prisma.clientReminder.create({
      data: { companyId, clientId, title: input.title, dueDate: new Date(input.dueDate) },
    });
  }

  async completeReminder(companyId: string, clientId: string, reminderId: string) {
    await this.get(companyId, clientId);
    const reminder = await this.prisma.clientReminder.findFirst({ where: { id: reminderId, clientId } });
    if (!reminder) throw new NotFoundException("Reminder not found");
    return this.prisma.clientReminder.update({ where: { id: reminderId }, data: { done: true } });
  }

  /** Not-yet-done reminders company-wide, soonest first — a small "what needs follow-up" list. */
  listUpcomingReminders(companyId: string) {
    return this.prisma.clientReminder.findMany({
      where: { companyId, done: false },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
      take: 20,
    });
  }
}
