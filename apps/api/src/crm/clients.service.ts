import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  AddClientActivityInput,
  AddClientReminderInput,
  CreateClientInput,
  ImportResult,
  UpdateClientInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { parseCsvRecords } from "../common/csv";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.client.findMany({ where: { companyId }, orderBy: { name: "asc" } });
  }

  async get(companyId: string, id: string) {
    const client = await this.prisma.client.findFirst({ where: { id, companyId } });
    if (!client) throw new NotFoundException("Client not found");
    return client;
  }

  create(companyId: string, input: CreateClientInput) {
    return this.prisma.client.create({ data: { ...input, companyId } });
  }

  async update(companyId: string, id: string, input: UpdateClientInput) {
    await this.get(companyId, id);
    return this.prisma.client.update({ where: { id }, data: input });
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
