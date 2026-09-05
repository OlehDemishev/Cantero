import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateLienNoticeInput, CreateMechanicsLienFilingInput, UpdateLienFilingStatusInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class LienComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listNoticesForProject(companyId: string, projectId: string) {
    return this.prisma.lienNotice.findMany({ where: { companyId, projectId }, orderBy: { createdAt: "desc" } });
  }

  async createNotice(companyId: string, actor: AuditActor, projectId: string, input: CreateLienNoticeInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const notice = await this.prisma.lienNotice.create({
      data: {
        companyId,
        projectId,
        direction: input.direction,
        type: input.type,
        relatedPartyName: input.relatedPartyName,
        firstFurnishDate: input.firstFurnishDate ? new Date(input.firstFurnishDate) : undefined,
        deadlineDate: input.deadlineDate ? new Date(input.deadlineDate) : undefined,
        methodOfService: input.methodOfService,
        notes: input.notes,
      },
    });
    this.audit.record(companyId, actor, "lien_notice.created", "LienNotice", notice.id, `Logged a ${input.direction} lien notice for "${project.name}"`);
    return notice;
  }

  async markNoticeSent(companyId: string, actor: AuditActor, id: string) {
    const notice = await this.prisma.lienNotice.findFirst({ where: { id, companyId } });
    if (!notice) throw new NotFoundException("Lien notice not found");
    if (notice.sentAt) throw new BadRequestException("This notice has already been marked sent");
    const updated = await this.prisma.lienNotice.update({ where: { id }, data: { sentAt: new Date() } });
    this.audit.record(companyId, actor, "lien_notice.sent", "LienNotice", id, `Marked notice to ${notice.relatedPartyName} as sent`);
    return updated;
  }

  listFilingsForProject(companyId: string, projectId: string) {
    return this.prisma.mechanicsLienFiling.findMany({ where: { companyId, projectId }, orderBy: { filedAt: "desc" } });
  }

  async createFiling(companyId: string, actor: AuditActor, projectId: string, input: CreateMechanicsLienFilingInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const filing = await this.prisma.mechanicsLienFiling.create({
      data: { companyId, projectId, filedByName: input.filedByName, amount: input.amount, filedAt: new Date(input.filedAt), notes: input.notes },
    });
    this.audit.record(companyId, actor, "mechanics_lien_filing.created", "MechanicsLienFiling", filing.id, `Recorded a lien filed by ${input.filedByName} on "${project.name}"`);
    return filing;
  }

  async updateFilingStatus(companyId: string, actor: AuditActor, id: string, input: UpdateLienFilingStatusInput) {
    const filing = await this.prisma.mechanicsLienFiling.findFirst({ where: { id, companyId } });
    if (!filing) throw new NotFoundException("Lien filing not found");
    const updated = await this.prisma.mechanicsLienFiling.update({
      where: { id },
      data: { status: input.status, releasedAt: input.status === "released" ? new Date() : undefined },
    });
    this.audit.record(companyId, actor, "mechanics_lien_filing.status_changed", "MechanicsLienFiling", id, `Changed lien filing status to ${input.status}`);
    return updated;
  }

  /** Sent-notice deadlines still upcoming, and received notices with a deadline that hasn't been
   * acted on — the "at risk of losing lien rights" list a compliance dashboard surfaces. */
  async upcomingDeadlines(companyId: string, days = 30) {
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return this.prisma.lienNotice.findMany({
      where: { companyId, sentAt: null, deadlineDate: { lte: cutoff } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { deadlineDate: "asc" },
    });
  }
}
