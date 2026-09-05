import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AddMeetingActionItemInput, CreateMeetingInput, ResolveMeetingActionItemInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
  ) {}

  listForProject(companyId: string, projectId: string) {
    return this.prisma.meeting.findMany({
      where: { companyId, projectId },
      include: { actionItems: { orderBy: { createdAt: "asc" } } },
      orderBy: { number: "desc" },
    });
  }

  async get(companyId: string, id: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id, companyId }, include: { actionItems: { orderBy: { createdAt: "asc" } } } });
    if (!meeting) throw new NotFoundException("Meeting not found");
    return meeting;
  }

  /** Every still-open action item across a project's meeting history — the standing "carry forward" list for the next agenda. */
  openActionItems(companyId: string, projectId: string) {
    return this.prisma.meetingActionItem.findMany({
      where: { status: "open", meeting: { companyId, projectId } },
      include: { meeting: { select: { id: true, number: true, title: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(companyId: string, actor: AuditActor, input: CreateMeetingInput) {
    const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const existingCount = await this.prisma.meeting.count({ where: { projectId: input.projectId } });
    const meeting = await this.prisma.meeting.create({
      data: {
        companyId,
        projectId: input.projectId,
        number: existingCount + 1,
        title: input.title,
        meetingDate: new Date(input.meetingDate),
        location: input.location,
        attendees: input.attendees,
        notes: input.notes,
        createdByUserId: actor.userId,
        createdByName: actor.name,
        actionItems: { create: input.actionItems.map((a) => ({ description: a.description, ownerName: a.ownerName, dueDate: a.dueDate ? new Date(a.dueDate) : undefined })) },
      },
      include: { actionItems: true },
    });

    this.audit.record(companyId, actor, "meeting.created", "Meeting", meeting.id, `Logged meeting #${meeting.number} "${input.title}" on "${project.name}"`);
    return meeting;
  }

  async addActionItem(companyId: string, actor: AuditActor, meetingId: string, input: AddMeetingActionItemInput) {
    const meeting = await this.findOrThrow(companyId, meetingId);
    const item = await this.prisma.meetingActionItem.create({
      data: { meetingId: meeting.id, description: input.description, ownerName: input.ownerName, dueDate: input.dueDate ? new Date(input.dueDate) : undefined },
    });
    this.audit.record(companyId, actor, "meeting.action_item_added", "MeetingActionItem", item.id, `Added action item to meeting #${meeting.number}: ${input.description}`);
    return item;
  }

  async resolveActionItem(companyId: string, actor: AuditActor, itemId: string, input: ResolveMeetingActionItemInput) {
    const item = await this.prisma.meetingActionItem.findFirst({ where: { id: itemId, meeting: { companyId } }, include: { meeting: true } });
    if (!item) throw new NotFoundException("Action item not found");
    if (item.status === "done") throw new BadRequestException("Action item is already resolved");

    const updated = await this.prisma.meetingActionItem.update({
      where: { id: itemId },
      data: { status: "done", resolvedAt: new Date(), resolvedByUserId: actor.userId, resolvedByName: input.resolvedByName },
    });
    this.audit.record(companyId, actor, "meeting.action_item_resolved", "MeetingActionItem", itemId, `${input.resolvedByName} resolved an action item from meeting #${item.meeting.number}: ${item.description}`);
    return updated;
  }

  /** Printable minutes for one meeting — attendees/location/notes as meta lines, action items as the table, same PdfService shape as invoices/estimates. */
  async generatePdf(companyId: string, id: string): Promise<Buffer> {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id, companyId },
      include: { actionItems: { orderBy: { createdAt: "asc" } }, project: { select: { name: true } } },
    });
    if (!meeting) throw new NotFoundException("Meeting not found");
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey).catch(() => undefined) : undefined;

    const meta = [
      { label: "Date", value: meeting.meetingDate.toISOString().slice(0, 10) },
      ...(meeting.location ? [{ label: "Location", value: meeting.location }] : []),
      ...(meeting.attendees.length > 0 ? [{ label: "Attendees", value: meeting.attendees.join(", ") }] : []),
      ...(meeting.notes ? [{ label: "Notes", value: meeting.notes }] : []),
    ];

    return this.pdf.render({
      title: `Meeting #${meeting.number} — ${meeting.title}`,
      subtitle: meeting.project.name,
      meta,
      tableHeader: ["Action item", "Owner", "Due date", "Status"],
      tableRows: meeting.actionItems.map((item) => ({
        cells: [item.description, item.ownerName, item.dueDate ? item.dueDate.toISOString().slice(0, 10) : "—", item.status],
      })),
      totals: [],
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
    });
  }

  private async findOrThrow(companyId: string, id: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id, companyId } });
    if (!meeting) throw new NotFoundException("Meeting not found");
    return meeting;
  }
}
