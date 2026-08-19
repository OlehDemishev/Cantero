import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  AddClientActivityInput,
  AddClientReminderInput,
  CreateClientInput,
  UpdateClientInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

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
