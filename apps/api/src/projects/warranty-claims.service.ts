import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateWarrantyClaimInput, DenyWarrantyClaimInput, ResolveWarrantyClaimInput, UpdateWarrantyClaimInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";

@Injectable()
export class WarrantyClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
  ) {}

  async listForProject(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);
    return this.prisma.warrantyClaim.findMany({
      where: { projectId },
      include: { assignee: { select: { id: true, name: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  }

  async get(companyId: string, id: string) {
    const claim = await this.prisma.warrantyClaim.findFirst({
      where: { id, companyId },
      include: { assignee: { select: { id: true, name: true } } },
    });
    if (!claim) throw new NotFoundException("Warranty claim not found");
    return claim;
  }

  async create(companyId: string, actor: AuditActor, input: CreateWarrantyClaimInput) {
    const project = await this.assertProject(companyId, input.projectId);
    if (input.assigneeWorkerId) await this.assertWorker(companyId, input.assigneeWorkerId);

    const claim = await this.prisma.warrantyClaim.create({
      data: {
        companyId,
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        location: input.location,
        assigneeWorkerId: input.assigneeWorkerId,
        submittedByUserId: actor.userId,
        submittedByName: actor.name,
      },
      include: { assignee: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "warranty_claim.created", "WarrantyClaim", claim.id, `Logged warranty claim "${claim.title}" on "${project.name}"`);
    this.webhooks.trigger(companyId, "warranty_claim.submitted", { warrantyClaimId: claim.id, title: claim.title, projectId: project.id });
    return claim;
  }

  async update(companyId: string, id: string, input: UpdateWarrantyClaimInput) {
    const claim = await this.get(companyId, id);
    if (input.assigneeWorkerId) await this.assertWorker(companyId, input.assigneeWorkerId);

    return this.prisma.warrantyClaim.update({
      where: { id: claim.id },
      data: {
        title: input.title,
        description: input.description,
        location: input.location,
        assigneeWorkerId: input.assigneeWorkerId,
      },
      include: { assignee: { select: { id: true, name: true } } },
    });
  }

  async start(companyId: string, actor: AuditActor, id: string) {
    const claim = await this.get(companyId, id);
    if (claim.status !== "open") throw new BadRequestException(`Claim is already ${claim.status}`);

    const updated = await this.prisma.warrantyClaim.update({
      where: { id: claim.id },
      data: { status: "in_progress" },
      include: { assignee: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "warranty_claim.started", "WarrantyClaim", claim.id, `Started work on "${claim.title}"`);
    return updated;
  }

  async resolve(companyId: string, actor: AuditActor, id: string, input: ResolveWarrantyClaimInput) {
    const claim = await this.get(companyId, id);
    if (claim.status === "resolved" || claim.status === "denied") throw new BadRequestException(`Claim is already ${claim.status}`);

    const updated = await this.prisma.warrantyClaim.update({
      where: { id: claim.id },
      data: { status: "resolved", resolvedAt: new Date(), resolvedByUserId: actor.userId, resolvedByName: actor.name, resolutionNotes: input.resolutionNotes },
      include: { assignee: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "warranty_claim.resolved", "WarrantyClaim", claim.id, `Resolved warranty claim "${claim.title}"`);
    this.webhooks.trigger(companyId, "warranty_claim.resolved", { warrantyClaimId: claim.id, title: claim.title });
    return updated;
  }

  async deny(companyId: string, actor: AuditActor, id: string, input: DenyWarrantyClaimInput) {
    const claim = await this.get(companyId, id);
    if (claim.status === "resolved" || claim.status === "denied") throw new BadRequestException(`Claim is already ${claim.status}`);

    const updated = await this.prisma.warrantyClaim.update({
      where: { id: claim.id },
      data: { status: "denied", deniedAt: new Date(), deniedByUserId: actor.userId, deniedByName: actor.name, denialReason: input.denialReason },
      include: { assignee: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "warranty_claim.denied", "WarrantyClaim", claim.id, `Denied warranty claim "${claim.title}": ${input.denialReason}`);
    this.webhooks.trigger(companyId, "warranty_claim.denied", { warrantyClaimId: claim.id, title: claim.title });
    return updated;
  }

  async reopen(companyId: string, actor: AuditActor, id: string) {
    const claim = await this.get(companyId, id);
    if (claim.status !== "resolved" && claim.status !== "denied") throw new BadRequestException("Claim is not closed");

    const updated = await this.prisma.warrantyClaim.update({
      where: { id: claim.id },
      data: {
        status: "open",
        resolvedAt: null,
        resolvedByUserId: null,
        resolvedByName: null,
        resolutionNotes: null,
        deniedAt: null,
        deniedByUserId: null,
        deniedByName: null,
        denialReason: null,
      },
      include: { assignee: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "warranty_claim.reopened", "WarrantyClaim", claim.id, `Reopened warranty claim "${claim.title}"`);
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
