import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreatePunchListItemInput, UpdatePunchListItemInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class PunchListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForProject(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);
    return this.prisma.punchListItem.findMany({
      where: { projectId },
      include: { assignee: { select: { id: true, name: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  }

  async get(companyId: string, id: string) {
    const item = await this.prisma.punchListItem.findFirst({
      where: { id, companyId },
      include: { assignee: { select: { id: true, name: true } } },
    });
    if (!item) throw new NotFoundException("Punch list item not found");
    return item;
  }

  async create(companyId: string, actor: AuditActor, input: CreatePunchListItemInput) {
    await this.assertProject(companyId, input.projectId);
    if (input.assigneeWorkerId) await this.assertWorker(companyId, input.assigneeWorkerId);

    const item = await this.prisma.punchListItem.create({
      data: {
        companyId,
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        location: input.location,
        assigneeWorkerId: input.assigneeWorkerId,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        createdByUserId: actor.userId,
        createdByName: actor.name,
      },
      include: { assignee: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "punch_list.created", "PunchListItem", item.id, `Logged punch list item "${item.title}"`);
    return item;
  }

  async update(companyId: string, actor: AuditActor, id: string, input: UpdatePunchListItemInput) {
    const existing = await this.get(companyId, id);
    if (input.assigneeWorkerId) await this.assertWorker(companyId, input.assigneeWorkerId);

    return this.prisma.punchListItem.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        description: input.description,
        location: input.location,
        assigneeWorkerId: input.assigneeWorkerId,
        dueDate: input.dueDate === null ? null : input.dueDate ? new Date(input.dueDate) : undefined,
      },
      include: { assignee: { select: { id: true, name: true } } },
    });
  }

  async resolve(companyId: string, actor: AuditActor, id: string) {
    const item = await this.get(companyId, id);
    if (item.status !== "open") throw new BadRequestException(`Item is already ${item.status}`);

    const updated = await this.prisma.punchListItem.update({
      where: { id: item.id },
      data: { status: "resolved", resolvedAt: new Date(), resolvedByUserId: actor.userId, resolvedByName: actor.name },
      include: { assignee: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "punch_list.resolved", "PunchListItem", item.id, `Marked "${item.title}" resolved`);
    return updated;
  }

  async verify(companyId: string, actor: AuditActor, id: string) {
    const item = await this.get(companyId, id);
    if (item.status !== "resolved") throw new BadRequestException("Only a resolved item can be verified");

    const updated = await this.prisma.punchListItem.update({
      where: { id: item.id },
      data: { status: "verified", verifiedAt: new Date(), verifiedByUserId: actor.userId, verifiedByName: actor.name },
      include: { assignee: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "punch_list.verified", "PunchListItem", item.id, `Verified fix for "${item.title}"`);
    return updated;
  }

  async reopen(companyId: string, actor: AuditActor, id: string) {
    const item = await this.get(companyId, id);
    if (item.status === "open") throw new BadRequestException("Item is already open");

    const updated = await this.prisma.punchListItem.update({
      where: { id: item.id },
      data: {
        status: "open",
        resolvedAt: null,
        resolvedByUserId: null,
        resolvedByName: null,
        verifiedAt: null,
        verifiedByUserId: null,
        verifiedByName: null,
      },
      include: { assignee: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "punch_list.reopened", "PunchListItem", item.id, `Reopened "${item.title}"`);
    return updated;
  }

  private async assertProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  private async assertWorker(companyId: string, workerId: string) {
    const worker = await this.prisma.worker.findFirst({ where: { id: workerId, companyId } });
    if (!worker) throw new BadRequestException("Assignee does not belong to this company");
    return worker;
  }
}
