import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AddSubcontractorDocumentInput,
  AddSubcontractorPaymentInput,
  CreatePerformanceReviewInput,
  CreateSubcontractorInput,
  SetSubcontractorDiversityCertificationsInput,
  SubcontractorDocumentType,
  UpdateSubcontractorProfileInput,
  UpdateSubcontractorTaxProfileInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { calculateDiversitySpend } from "./diversity-spend";
import { SubcontractorPrequalificationService } from "../subcontractor-prequalification/subcontractor-prequalification.service";

/// The two documents virtually every jurisdiction requires on file before a sub can legally work
/// on a job site — assign() blocks on these, complianceStatus() reports on them individually.
const REQUIRED_DOCUMENT_TYPES: SubcontractorDocumentType[] = ["general_liability_insurance", "workers_comp_insurance"];

/// Every Subcontractor column except taxId — list()/the general reads never return the raw TIN;
/// only getTaxProfile() (a dedicated, deliberately separate call) does. Kept as an explicit list
/// rather than Prisma's `omit` so a future field addition doesn't silently leak by default.
const SUBCONTRACTOR_SELECT_WITHOUT_TAX_ID = {
  id: true,
  companyId: true,
  name: true,
  email: true,
  phone: true,
  specialization: true,
  bio: true,
  publicToken: true,
  publicListed: true,
  licenseNumber: true,
  bondingCapacity: true,
  safetyProgramSummary: true,
  legalBusinessName: true,
  mailingAddress: true,
  diversityCertifications: true,
  diversityCertificationExpiresAt: true,
} as const;

function maskTaxId(taxId: string | null): string | null {
  if (!taxId) return null;
  const digits = taxId.replace(/\D/g, "");
  return digits.length >= 4 ? `***-**-${digits.slice(-4)}` : "***";
}

@Injectable()
export class SubcontractorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly prequalification: SubcontractorPrequalificationService,
  ) {}

  list(companyId: string) {
    return this.prisma.subcontractor.findMany({
      where: { companyId },
      select: SUBCONTRACTOR_SELECT_WITHOUT_TAX_ID,
      orderBy: { name: "asc" },
    });
  }

  create(companyId: string, input: CreateSubcontractorInput) {
    return this.prisma.subcontractor.create({ data: { ...input, companyId } });
  }

  listAssignments(companyId: string, subcontractorId: string) {
    return this.prisma.subcontractorAssignment.findMany({
      where: { subcontractorId, subcontractor: { companyId } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async assign(companyId: string, subcontractorId: string, projectId: string, startDate?: string, endDate?: string) {
    const subcontractor = await this.prisma.subcontractor.findFirst({ where: { id: subcontractorId, companyId } });
    if (!subcontractor) throw new NotFoundException("Subcontractor not found");
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    await this.assertCompliant(companyId, subcontractorId, subcontractor.name);

    const dates = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };
    return this.prisma.subcontractorAssignment.upsert({
      where: { subcontractorId_projectId: { subcontractorId, projectId } },
      create: { subcontractorId, projectId, ...dates },
      update: dates,
      include: { project: { select: { name: true } } },
    });
  }

  async unassign(companyId: string, subcontractorId: string, assignmentId: string) {
    const assignment = await this.prisma.subcontractorAssignment.findFirst({
      where: { id: assignmentId, subcontractorId, subcontractor: { companyId } },
    });
    if (!assignment) throw new NotFoundException("Assignment not found");
    await this.prisma.subcontractorAssignment.delete({ where: { id: assignmentId } });
    return { ok: true };
  }

  async setActualEndDate(companyId: string, subcontractorId: string, assignmentId: string, actualEndDate: string | null) {
    const assignment = await this.prisma.subcontractorAssignment.findFirst({
      where: { id: assignmentId, subcontractorId, subcontractor: { companyId } },
    });
    if (!assignment) throw new NotFoundException("Assignment not found");
    return this.prisma.subcontractorAssignment.update({
      where: { id: assignmentId },
      data: { actualEndDate: actualEndDate ? new Date(actualEndDate) : null },
    });
  }

  async addPerformanceReview(companyId: string, actor: AuditActor, subcontractorId: string, input: CreatePerformanceReviewInput) {
    const subcontractor = await this.assertOwned(companyId, subcontractorId);
    if (input.assignmentId) {
      const assignment = await this.prisma.subcontractorAssignment.findFirst({
        where: { id: input.assignmentId, subcontractorId, subcontractor: { companyId } },
      });
      if (!assignment) throw new NotFoundException("Assignment not found");
    }

    const review = await this.prisma.subcontractorPerformanceReview.create({
      data: {
        companyId,
        subcontractorId,
        assignmentId: input.assignmentId,
        reviewedByUserId: actor.userId,
        reviewedByName: actor.name,
        rating: input.rating,
        onTime: input.onTime,
        safetyIncidents: input.safetyIncidents,
        reworkCount: input.reworkCount,
        wouldHireAgain: input.wouldHireAgain,
        comments: input.comments,
      },
    });
    this.audit.record(
      companyId,
      actor,
      "subcontractor.performance_reviewed",
      "Subcontractor",
      subcontractorId,
      `Rated "${subcontractor.name}" ${input.rating}/5`,
    );
    return review;
  }

  listPerformanceReviews(companyId: string, subcontractorId: string) {
    return this.prisma.subcontractorPerformanceReview.findMany({
      where: { companyId, subcontractorId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Rolled up at read time from the review history — no cached/denormalized score field, same
   * reasoning as complianceStatus() above. */
  async performanceScorecard(companyId: string, subcontractorId: string) {
    await this.assertOwned(companyId, subcontractorId);
    const reviews = await this.prisma.subcontractorPerformanceReview.findMany({ where: { companyId, subcontractorId } });

    if (reviews.length === 0) {
      return { reviewCount: 0, averageRating: null, onTimePercent: null, wouldHireAgainPercent: null, totalSafetyIncidents: 0, totalReworkCount: 0 };
    }

    const onTimeAnswered = reviews.filter((r) => r.onTime !== null);
    const hireAgainAnswered = reviews.filter((r) => r.wouldHireAgain !== null);
    const round1 = (n: number) => Math.round(n * 10) / 10;

    return {
      reviewCount: reviews.length,
      averageRating: round1(reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length),
      onTimePercent: onTimeAnswered.length > 0 ? round1((onTimeAnswered.filter((r) => r.onTime).length / onTimeAnswered.length) * 100) : null,
      wouldHireAgainPercent:
        hireAgainAnswered.length > 0 ? round1((hireAgainAnswered.filter((r) => r.wouldHireAgain).length / hireAgainAnswered.length) * 100) : null,
      totalSafetyIncidents: reviews.reduce((sum, r) => sum + r.safetyIncidents, 0),
      totalReworkCount: reviews.reduce((sum, r) => sum + r.reworkCount, 0),
    };
  }

  listDocuments(companyId: string, subcontractorId: string) {
    return this.prisma.subcontractorDocument.findMany({
      where: { companyId, subcontractorId },
      orderBy: { expiresAt: "asc" },
    });
  }

  async addDocument(companyId: string, actor: AuditActor, subcontractorId: string, input: AddSubcontractorDocumentInput) {
    const subcontractor = await this.prisma.subcontractor.findFirst({ where: { id: subcontractorId, companyId } });
    if (!subcontractor) throw new NotFoundException("Subcontractor not found");

    const doc = await this.prisma.subcontractorDocument.create({
      data: { companyId, subcontractorId, type: input.type, name: input.name, expiresAt: new Date(input.expiresAt) },
    });
    this.audit.record(
      companyId,
      actor,
      "subcontractor_document.added",
      "SubcontractorDocument",
      doc.id,
      `Added ${input.type.replace(/_/g, " ")} for "${subcontractor.name}", expires ${doc.expiresAt.toLocaleDateString()}`,
    );
    return doc;
  }

  async deleteDocument(companyId: string, subcontractorId: string, documentId: string) {
    const doc = await this.prisma.subcontractorDocument.findFirst({ where: { id: documentId, subcontractorId, companyId } });
    if (!doc) throw new NotFoundException("Document not found");
    await this.prisma.subcontractorDocument.delete({ where: { id: documentId } });
    return { ok: true };
  }

  /** Per-requirement breakdown (missing/expired/valid) — lets the UI show compliance status
   * inline without waiting for an assign() call to fail. */
  async complianceStatus(companyId: string, subcontractorId: string) {
    const subcontractor = await this.prisma.subcontractor.findFirst({ where: { id: subcontractorId, companyId } });
    if (!subcontractor) throw new NotFoundException("Subcontractor not found");

    const now = new Date();
    const docs = await this.prisma.subcontractorDocument.findMany({
      where: { companyId, subcontractorId, type: { in: REQUIRED_DOCUMENT_TYPES } },
      orderBy: { expiresAt: "desc" },
    });

    const requirements = REQUIRED_DOCUMENT_TYPES.map((type) => {
      const current = docs.find((d) => d.type === type && d.expiresAt.getTime() > now.getTime());
      const latest = current ?? docs.find((d) => d.type === type);
      return {
        type,
        status: (!latest ? "missing" : current ? "valid" : "expired") as "missing" | "expired" | "valid",
        expiresAt: latest?.expiresAt.toISOString() ?? null,
      };
    });

    return { compliant: requirements.every((r) => r.status === "valid"), requirements };
  }

  async updateProfile(companyId: string, id: string, input: UpdateSubcontractorProfileInput) {
    await this.assertOwned(companyId, id);
    return this.prisma.subcontractor.update({ where: { id }, data: input });
  }

  /** A shareable reference/portfolio page a GC can hand to a trusted sub to help them win work
   * elsewhere — not a cross-company search directory (a Subcontractor row is still owned by one
   * company), just a public link showing what this company can vouch for. */
  async setPublicListed(companyId: string, id: string, publicListed: boolean) {
    const subcontractor = await this.assertOwned(companyId, id);
    return this.prisma.subcontractor.update({
      where: { id },
      data: {
        publicListed,
        publicToken: publicListed ? (subcontractor.publicToken ?? randomBytes(16).toString("hex")) : subcontractor.publicToken,
      },
    });
  }

  /** Self-reported MBE/WBE/DBE/etc. certifications — see the schema doc comment on
   * Subcontractor.diversityCertifications. Not gated against anything, purely informational
   * until diversitySpendReport() rolls it up for public-work compliance reporting. */
  async setDiversityCertifications(companyId: string, actor: AuditActor, id: string, input: SetSubcontractorDiversityCertificationsInput) {
    const subcontractor = await this.assertOwned(companyId, id);
    const updated = await this.prisma.subcontractor.update({
      where: { id },
      data: {
        diversityCertifications: input.diversityCertifications,
        diversityCertificationExpiresAt: input.diversityCertificationExpiresAt,
      },
      select: SUBCONTRACTOR_SELECT_WITHOUT_TAX_ID,
    });
    this.audit.record(
      companyId,
      actor,
      "subcontractor.diversity_certifications_updated",
      "Subcontractor",
      id,
      `Updated diversity certifications for "${subcontractor.name}"`,
    );
    return updated;
  }

  /** Spend-by-certification rollup for public-work bid compliance reporting — paid
   * SubcontractorCost only, since committed-but-unpaid spend isn't yet "spend". Company-wide
   * when projectId is omitted. */
  async diversitySpendReport(companyId: string, projectId?: string) {
    const costs = await this.prisma.subcontractorCost.findMany({
      where: { companyId, paid: true, ...(projectId ? { projectId } : {}) },
      select: { amount: true, subcontractor: { select: { diversityCertifications: true } } },
    });

    return calculateDiversitySpend(costs.map((c) => ({ categories: c.subcontractor.diversityCertifications, amount: Number(c.amount) })));
  }

  /** Public, unauthenticated — track record is this company's own history with the sub
   * (projects worked, amount paid out), not a cross-company rating. Performance review data
   * (SubcontractorPerformanceReview) is deliberately excluded here — it's the GC's private
   * internal assessment, not something to publish, good or bad, on a page meant to help the
   * sub win work elsewhere. */
  async getPublicProfile(token: string) {
    const subcontractor = await this.prisma.subcontractor.findFirst({
      where: { publicToken: token, publicListed: true },
      include: { company: { select: { name: true } } },
    });
    if (!subcontractor) throw new NotFoundException("Profile not found");

    const [projectsWorked, paidTotal] = await Promise.all([
      this.prisma.subcontractorAssignment.count({ where: { subcontractorId: subcontractor.id } }),
      this.prisma.subcontractorCost.aggregate({ where: { subcontractorId: subcontractor.id, paid: true }, _sum: { amount: true } }),
    ]);

    return {
      name: subcontractor.name,
      specialization: subcontractor.specialization,
      bio: subcontractor.bio,
      referencedBy: subcontractor.company.name,
      projectsWorked,
      totalPaidOut: Number(paidTotal._sum.amount ?? 0),
    };
  }

  /** The one place the raw taxId is ever returned — everything else (list(), the public
   * profile) either omits it or masks it via taxSummary(). */
  async getTaxProfile(companyId: string, id: string) {
    const subcontractor = await this.prisma.subcontractor.findFirst({
      where: { id, companyId },
      select: { taxId: true, legalBusinessName: true, mailingAddress: true },
    });
    if (!subcontractor) throw new NotFoundException("Subcontractor not found");
    return subcontractor;
  }

  async updateTaxProfile(companyId: string, id: string, input: UpdateSubcontractorTaxProfileInput) {
    await this.assertOwned(companyId, id);
    await this.prisma.subcontractor.update({ where: { id }, data: input });
    return this.getTaxProfile(companyId, id);
  }

  listPayments(companyId: string, subcontractorId: string) {
    return this.prisma.subcontractorPayment.findMany({ where: { companyId, subcontractorId }, orderBy: { paidAt: "desc" } });
  }

  /** A standalone/lump-sum payment not tied to one specific SubcontractorCost line (e.g. a
   * retainage release or a payment covering several bills at once) — SubcontractorCostsService's
   * markPaid() creates the tied-to-a-cost variant automatically instead of going through here. */
  async addPayment(companyId: string, actor: AuditActor, subcontractorId: string, input: AddSubcontractorPaymentInput) {
    const subcontractor = await this.assertOwned(companyId, subcontractorId);
    if (input.subcontractorCostId) {
      const cost = await this.prisma.subcontractorCost.findFirst({ where: { id: input.subcontractorCostId, companyId, subcontractorId } });
      if (!cost) throw new NotFoundException("Subcontractor cost not found");
    }

    const payment = await this.prisma.subcontractorPayment.create({
      data: {
        companyId,
        subcontractorId,
        subcontractorCostId: input.subcontractorCostId,
        amount: input.amount,
        paidAt: input.paidAt ? new Date(input.paidAt) : undefined,
        note: input.note,
      },
    });
    this.audit.record(companyId, actor, "subcontractor_payment.recorded", "Subcontractor", subcontractorId, `Recorded a payment of ${input.amount} to "${subcontractor.name}"`);
    return payment;
  }

  /** Calendar-year totals for every subcontractor with at least one payment in that year, for
   * 1099-NEC prep — reportable at $600, the current IRS threshold. Computed from
   * SubcontractorPayment (actual cash out), not SubcontractorCost (accrued, undated-by-year); see
   * the model comments for why the two can't be conflated. taxId is masked to last-4 here —
   * getTaxProfile() is the only place the full value is returned. */
  async taxSummary(companyId: string, year: number) {
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year + 1, 0, 1));

    const payments = await this.prisma.subcontractorPayment.groupBy({
      by: ["subcontractorId"],
      where: { companyId, paidAt: { gte: from, lt: to } },
      _sum: { amount: true },
    });
    if (payments.length === 0) return [];

    const subcontractors = await this.prisma.subcontractor.findMany({
      where: { id: { in: payments.map((p) => p.subcontractorId) } },
      select: { id: true, name: true, taxId: true, legalBusinessName: true, mailingAddress: true },
    });
    const byId = new Map(subcontractors.map((s) => [s.id, s]));

    return payments
      .map((p) => {
        const sub = byId.get(p.subcontractorId);
        const totalPaid = Number(p._sum.amount ?? 0);
        return {
          subcontractorId: p.subcontractorId,
          name: sub?.name ?? "",
          legalBusinessName: sub?.legalBusinessName ?? null,
          taxIdMasked: maskTaxId(sub?.taxId ?? null),
          mailingAddress: sub?.mailingAddress ?? null,
          totalPaid,
          reportable: totalPaid >= 600,
        };
      })
      .sort((a, b) => b.totalPaid - a.totalPaid);
  }

  private async assertOwned(companyId: string, id: string) {
    const subcontractor = await this.prisma.subcontractor.findFirst({ where: { id, companyId } });
    if (!subcontractor) throw new NotFoundException("Subcontractor not found");
    return subcontractor;
  }

  private async assertCompliant(companyId: string, subcontractorId: string, subcontractorName: string) {
    const now = new Date();
    const validDocs = await this.prisma.subcontractorDocument.findMany({
      where: { companyId, subcontractorId, type: { in: REQUIRED_DOCUMENT_TYPES }, expiresAt: { gt: now } },
    });
    const validTypes = new Set(validDocs.map((d) => d.type));
    const missing = REQUIRED_DOCUMENT_TYPES.filter((t) => !validTypes.has(t));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Cannot assign "${subcontractorName}" — missing or expired: ${missing.map((t) => t.replace(/_/g, " ")).join(", ")}`,
      );
    }

    await this.assertSafetyGate(companyId, subcontractorId, subcontractorName);
  }

  /** Independent from the insurance-document check above — a company can require one, both, or
   * neither. requireSubcontractorPrequalification gates on having an approved, non-expired cycle
   * at all; subcontractorEmrThreshold (set on its own) additionally gates on the EMR value itself,
   * so a company can enforce "must be prequalified" and/or "EMR must be under X" independently. */
  private async assertSafetyGate(companyId: string, subcontractorId: string, subcontractorName: string) {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { requireSubcontractorPrequalification: true, subcontractorEmrThreshold: true },
    });
    if (!company.requireSubcontractorPrequalification && company.subcontractorEmrThreshold === null) return;

    const current = await this.prequalification.getCurrentValid(companyId, subcontractorId);
    if (company.requireSubcontractorPrequalification && !current) {
      throw new BadRequestException(`Cannot assign "${subcontractorName}" — no approved, current prequalification on file`);
    }
    if (company.subcontractorEmrThreshold !== null && current?.safetyEmrRating !== null && current?.safetyEmrRating !== undefined) {
      if (Number(current.safetyEmrRating) > Number(company.subcontractorEmrThreshold)) {
        throw new BadRequestException(
          `Cannot assign "${subcontractorName}" — EMR ${current.safetyEmrRating} exceeds the company threshold of ${company.subcontractorEmrThreshold}`,
        );
      }
    }
  }
}
