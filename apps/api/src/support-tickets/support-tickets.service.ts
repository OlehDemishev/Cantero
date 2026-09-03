import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AddTicketMessageInput,
  AssignTicketInput,
  CreateSupportTicketInput,
  PortalAddTicketMessageInput,
  PortalCreateTicketInput,
  TicketStatus,
  UpdateTicketStatusInput,
  UpsertSlaPolicyInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import type { PortalClientContext } from "../portal/portal-jwt.service";
import { calculateSlaBreachStatus, calculateSlaDeadlines } from "./ticket-sla";

const INCLUDE = {
  requesterClient: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
} as const;

@Injectable()
export class SupportTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(companyId: string, status?: TicketStatus) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { companyId, status },
      include: INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    return tickets.map((t) => this.withBreachStatus(t));
  }

  async get(companyId: string, id: string) {
    const ticket = await this.findOrThrow(companyId, id);
    const messages = await this.prisma.ticketMessage.findMany({ where: { ticketId: id }, orderBy: { createdAt: "asc" } });
    return { ...this.withBreachStatus(ticket), messages };
  }

  async create(companyId: string, actor: AuditActor, input: CreateSupportTicketInput) {
    if (input.projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
      if (!project) throw new NotFoundException("Project not found");
    }
    if (input.requesterClientId) {
      const client = await this.prisma.client.findFirst({ where: { id: input.requesterClientId, companyId } });
      if (!client) throw new NotFoundException("Client not found");
    }

    const priority = input.priority ?? "medium";
    const createdAt = new Date();
    const policy = await this.prisma.slaPolicy.findUnique({ where: { companyId_priority: { companyId, priority } } });
    const deadlines = calculateSlaDeadlines(policy, createdAt);

    const ticket = await this.prisma.supportTicket.create({
      data: {
        companyId,
        projectId: input.projectId,
        requesterClientId: input.requesterClientId,
        requesterName: input.requesterName,
        requesterEmail: input.requesterEmail,
        subject: input.subject,
        category: input.category,
        priority,
        createdAt,
        ...deadlines,
      },
      include: INCLUDE,
    });
    this.audit.record(companyId, actor, "support_ticket.created", "SupportTicket", ticket.id, `Filed ticket "${input.subject}"`);
    return this.withBreachStatus(ticket);
  }

  async updateStatus(companyId: string, actor: AuditActor, id: string, input: UpdateTicketStatusInput) {
    const ticket = await this.findOrThrow(companyId, id);
    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        status: input.status,
        resolvedAt: input.status === "resolved" || input.status === "closed" ? new Date() : undefined,
      },
      include: INCLUDE,
    });
    this.audit.record(companyId, actor, "support_ticket.status_changed", "SupportTicket", id, `Changed ticket "${ticket.subject}" to ${input.status}`);
    return this.withBreachStatus(updated);
  }

  async assign(companyId: string, actor: AuditActor, id: string, input: AssignTicketInput) {
    const ticket = await this.findOrThrow(companyId, id);
    if (input.userId) {
      const membership = await this.prisma.membership.findFirst({ where: { userId: input.userId, companyId } });
      if (!membership) throw new BadRequestException("User does not belong to this company");
    }
    const updated = await this.prisma.supportTicket.update({ where: { id }, data: { assignedToUserId: input.userId }, include: INCLUDE });
    this.audit.record(companyId, actor, "support_ticket.assigned", "SupportTicket", id, `Assigned ticket "${ticket.subject}"`);
    return this.withBreachStatus(updated);
  }

  async addMessage(companyId: string, actor: AuditActor, id: string, input: AddTicketMessageInput) {
    await this.findOrThrow(companyId, id);
    const message = await this.prisma.ticketMessage.create({
      data: { companyId, ticketId: id, content: input.content, authorName: actor.name, authorUserId: actor.userId, isInternal: input.isInternal ?? false },
    });
    if (!input.isInternal) {
      await this.prisma.supportTicket.updateMany({ where: { id, firstRespondedAt: null }, data: { firstRespondedAt: new Date() } });
    }
    return message;
  }

  listSlaPolicies(companyId: string) {
    return this.prisma.slaPolicy.findMany({ where: { companyId } });
  }

  async upsertSlaPolicy(companyId: string, actor: AuditActor, input: UpsertSlaPolicyInput) {
    const policy = await this.prisma.slaPolicy.upsert({
      where: { companyId_priority: { companyId, priority: input.priority } },
      create: { companyId, priority: input.priority, responseMinutes: input.responseMinutes, resolutionMinutes: input.resolutionMinutes },
      update: { responseMinutes: input.responseMinutes, resolutionMinutes: input.resolutionMinutes },
    });
    this.audit.record(companyId, actor, "sla_policy.updated", "SlaPolicy", policy.id, `Updated SLA policy for ${input.priority}`);
    return policy;
  }

  // ---- Client-portal-facing ----

  async listForClient(client: PortalClientContext) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { companyId: client.companyId, requesterClientId: client.clientId },
      orderBy: { createdAt: "desc" },
    });
    return tickets.map((t) => this.withBreachStatus(t));
  }

  async getForClient(client: PortalClientContext, id: string) {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id, companyId: client.companyId, requesterClientId: client.clientId } });
    if (!ticket) throw new NotFoundException("Ticket not found");
    const messages = await this.prisma.ticketMessage.findMany({ where: { ticketId: id, isInternal: false }, orderBy: { createdAt: "asc" } });
    return { ...this.withBreachStatus(ticket), messages };
  }

  async createForClient(client: PortalClientContext, input: PortalCreateTicketInput) {
    const record = await this.prisma.client.findUniqueOrThrow({ where: { id: client.clientId }, select: { name: true, email: true } });
    if (input.projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId: client.companyId, clientId: client.clientId } });
      if (!project) throw new NotFoundException("Project not found");
    }

    const createdAt = new Date();
    const policy = await this.prisma.slaPolicy.findUnique({ where: { companyId_priority: { companyId: client.companyId, priority: "medium" } } });
    const deadlines = calculateSlaDeadlines(policy, createdAt);

    const ticket = await this.prisma.supportTicket.create({
      data: {
        companyId: client.companyId,
        projectId: input.projectId,
        requesterClientId: client.clientId,
        requesterName: record.name,
        requesterEmail: record.email ?? undefined,
        subject: input.subject,
        category: input.category,
        createdAt,
        ...deadlines,
      },
    });
    await this.prisma.ticketMessage.create({
      data: { companyId: client.companyId, ticketId: ticket.id, content: input.content, authorName: record.name },
    });
    return this.withBreachStatus(ticket);
  }

  async addMessageForClient(client: PortalClientContext, id: string, input: PortalAddTicketMessageInput) {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id, companyId: client.companyId, requesterClientId: client.clientId } });
    if (!ticket) throw new NotFoundException("Ticket not found");
    const record = await this.prisma.client.findUniqueOrThrow({ where: { id: client.clientId }, select: { name: true } });
    return this.prisma.ticketMessage.create({
      data: { companyId: client.companyId, ticketId: id, content: input.content, authorName: record.name },
    });
  }

  private withBreachStatus<T extends { slaResponseDueAt: Date | null; slaResolutionDueAt: Date | null; firstRespondedAt: Date | null; status: string }>(
    ticket: T,
  ) {
    return { ...ticket, sla: calculateSlaBreachStatus(ticket, new Date()) };
  }

  private async findOrThrow(companyId: string, id: string) {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id, companyId }, include: INCLUDE });
    if (!ticket) throw new NotFoundException("Support ticket not found");
    return ticket;
  }
}
