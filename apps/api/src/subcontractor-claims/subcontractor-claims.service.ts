import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateBackchargeInput, CreateDefaultNoticeInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { calculateCureDeadline } from "./cure-deadline";

@Injectable()
export class SubcontractorClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Backcharges

  listBackchargesForProject(companyId: string, projectId: string) {
    return this.prisma.subcontractorBackcharge.findMany({
      where: { companyId, projectId },
      include: { subcontractor: true, punchListItem: true, warrantyClaim: true },
      orderBy: { createdAt: "desc" },
    });
  }

  listBackchargesForSubcontractor(companyId: string, subcontractorId: string) {
    return this.prisma.subcontractorBackcharge.findMany({
      where: { companyId, subcontractorId },
      include: { project: true, punchListItem: true, warrantyClaim: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async createBackcharge(companyId: string, actor: AuditActor, projectId: string, input: CreateBackchargeInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const subcontractor = await this.prisma.subcontractor.findFirst({ where: { id: input.subcontractorId, companyId } });
    if (!subcontractor) throw new NotFoundException("Subcontractor not found");

    if (input.punchListItemId) {
      const punchListItem = await this.prisma.punchListItem.findFirst({ where: { id: input.punchListItemId, companyId, projectId } });
      if (!punchListItem) throw new NotFoundException("Punch list item not found");
    }
    if (input.warrantyClaimId) {
      const warrantyClaim = await this.prisma.warrantyClaim.findFirst({ where: { id: input.warrantyClaimId, companyId, projectId } });
      if (!warrantyClaim) throw new NotFoundException("Warranty claim not found");
    }

    const backcharge = await this.prisma.subcontractorBackcharge.create({
      data: {
        companyId,
        projectId,
        subcontractorId: input.subcontractorId,
        punchListItemId: input.punchListItemId,
        warrantyClaimId: input.warrantyClaimId,
        description: input.description,
        amount: input.amount,
        createdByName: actor.name,
      },
      include: { subcontractor: true, punchListItem: true, warrantyClaim: true },
    });

    this.audit.record(
      companyId,
      actor,
      "subcontractor_backcharge.created",
      "SubcontractorBackcharge",
      backcharge.id,
      `Backcharged "${subcontractor.name}" ${input.amount} for "${input.description}"`,
    );
    return backcharge;
  }

  async markBackchargeDeducted(companyId: string, actor: AuditActor, id: string) {
    return this.transitionBackcharge(companyId, actor, id, "deducted");
  }

  async markBackchargeWaived(companyId: string, actor: AuditActor, id: string) {
    return this.transitionBackcharge(companyId, actor, id, "waived");
  }

  private async transitionBackcharge(companyId: string, actor: AuditActor, id: string, status: "deducted" | "waived") {
    const backcharge = await this.prisma.subcontractorBackcharge.findFirst({ where: { id, companyId } });
    if (!backcharge) throw new NotFoundException("Backcharge not found");
    if (backcharge.status !== "pending") throw new BadRequestException("Only a pending backcharge can be resolved");

    const updated = await this.prisma.subcontractorBackcharge.update({
      where: { id },
      data: { status, resolvedAt: new Date() },
      include: { subcontractor: true, punchListItem: true },
    });

    this.audit.record(companyId, actor, `subcontractor_backcharge.${status}`, "SubcontractorBackcharge", id, `Marked backcharge as ${status}`);
    return updated;
  }

  // Default notices

  listNoticesForProject(companyId: string, projectId: string) {
    return this.prisma.subcontractorDefaultNotice.findMany({
      where: { companyId, projectId },
      include: { subcontractor: true },
      orderBy: { noticeDate: "desc" },
    });
  }

  listNoticesForSubcontractor(companyId: string, subcontractorId: string) {
    return this.prisma.subcontractorDefaultNotice.findMany({
      where: { companyId, subcontractorId },
      include: { project: true },
      orderBy: { noticeDate: "desc" },
    });
  }

  async createDefaultNotice(companyId: string, actor: AuditActor, projectId: string, input: CreateDefaultNoticeInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const subcontractor = await this.prisma.subcontractor.findFirst({ where: { id: input.subcontractorId, companyId } });
    if (!subcontractor) throw new NotFoundException("Subcontractor not found");

    const noticeDate = new Date();
    const cureDeadline = calculateCureDeadline(noticeDate, input.curePeriodDays ?? null);

    const notice = await this.prisma.subcontractorDefaultNotice.create({
      data: {
        companyId,
        projectId,
        subcontractorId: input.subcontractorId,
        title: input.title,
        description: input.description,
        noticeDate,
        curePeriodDays: input.curePeriodDays,
        cureDeadline: cureDeadline ?? undefined,
        createdByName: actor.name,
      },
      include: { subcontractor: true },
    });

    this.audit.record(
      companyId,
      actor,
      "subcontractor_default_notice.issued",
      "SubcontractorDefaultNotice",
      notice.id,
      `Issued default notice "${input.title}" to "${subcontractor.name}"`,
    );
    return notice;
  }

  async markNoticeCured(companyId: string, actor: AuditActor, id: string) {
    return this.transitionNotice(companyId, actor, id, "cured");
  }

  async markNoticeTerminated(companyId: string, actor: AuditActor, id: string) {
    return this.transitionNotice(companyId, actor, id, "terminated");
  }

  private async transitionNotice(companyId: string, actor: AuditActor, id: string, status: "cured" | "terminated") {
    const notice = await this.prisma.subcontractorDefaultNotice.findFirst({ where: { id, companyId } });
    if (!notice) throw new NotFoundException("Default notice not found");
    if (notice.status !== "issued") throw new BadRequestException("Only an issued default notice can be resolved");

    const updated = await this.prisma.subcontractorDefaultNotice.update({
      where: { id },
      data: { status, resolvedAt: new Date() },
      include: { subcontractor: true },
    });

    this.audit.record(companyId, actor, `subcontractor_default_notice.${status}`, "SubcontractorDefaultNotice", id, `Marked default notice as ${status}`);
    return updated;
  }
}
