import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreatePrequalificationInput, DecidePrequalificationInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class SubcontractorPrequalificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listForSubcontractor(companyId: string, subcontractorId: string) {
    return this.prisma.subcontractorPrequalification.findMany({
      where: { companyId, subcontractorId },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(companyId: string, actor: AuditActor, subcontractorId: string, input: CreatePrequalificationInput) {
    const subcontractor = await this.prisma.subcontractor.findFirst({ where: { id: subcontractorId, companyId } });
    if (!subcontractor) throw new NotFoundException("Subcontractor not found");

    const record = await this.prisma.subcontractorPrequalification.create({
      data: {
        companyId,
        subcontractorId,
        licenseNumber: input.licenseNumber,
        bondingCapacity: input.bondingCapacity,
        yearsInBusiness: input.yearsInBusiness,
        safetyEmrRating: input.safetyEmrRating,
        referencesNotes: input.referencesNotes,
      },
    });
    this.audit.record(companyId, actor, "subcontractor_prequalification.started", "SubcontractorPrequalification", record.id, `Started a new prequalification cycle for "${subcontractor.name}"`);
    return record;
  }

  async decide(companyId: string, actor: AuditActor, id: string, input: DecidePrequalificationInput) {
    const record = await this.prisma.subcontractorPrequalification.findFirst({
      where: { id, companyId },
      include: { subcontractor: { select: { name: true } } },
    });
    if (!record) throw new NotFoundException("Prequalification not found");
    if (record.status !== "pending") throw new BadRequestException("This prequalification has already been decided");

    const updated = await this.prisma.subcontractorPrequalification.update({
      where: { id },
      data: {
        status: input.status,
        score: input.score,
        reviewedByName: input.reviewedByName,
        reviewedAt: new Date(),
        expiresAt: input.status === "approved" && input.expiresAt ? new Date(input.expiresAt) : undefined,
      },
    });
    this.audit.record(
      companyId,
      actor,
      "subcontractor_prequalification.decided",
      "SubcontractorPrequalification",
      id,
      `${input.reviewedByName} ${input.status} the prequalification for "${record.subcontractor.name}"`,
    );
    return updated;
  }

  /** The most recent approved cycle that hasn't expired — what SubcontractorsService.assign()
   * checks against when Company.requireSubcontractorPrequalification is on. Null means the sub
   * has never been approved, or every approval has lapsed; a rejected/pending cycle never counts
   * even if a prior approved one preceded it (a later rejection supersedes an older approval). */
  async getCurrentValid(companyId: string, subcontractorId: string) {
    const latest = await this.prisma.subcontractorPrequalification.findFirst({
      where: { companyId, subcontractorId },
      orderBy: { createdAt: "desc" },
    });
    if (!latest || latest.status !== "approved") return null;
    if (latest.expiresAt && latest.expiresAt <= new Date()) return null;
    return latest;
  }

  /** Approved prequalifications whose validity period ends within the window — the renewal
   * reminder list, mirroring the "expiring soon" shape used for insurance/permit/document expiry
   * elsewhere in this codebase. */
  async expiringSoon(companyId: string, days = 30) {
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return this.prisma.subcontractorPrequalification.findMany({
      where: { companyId, status: "approved", expiresAt: { lte: cutoff, not: null } },
      include: { subcontractor: { select: { id: true, name: true } } },
      orderBy: { expiresAt: "asc" },
    });
  }
}
