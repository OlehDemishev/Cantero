import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SubcontractorsService } from "./subcontractors.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { SubcontractorPrequalificationService } from "../subcontractor-prequalification/subcontractor-prequalification.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

describe("SubcontractorsService", () => {
  let service: SubcontractorsService;
  let prisma: {
    subcontractor: { findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    project: { findFirst: jest.Mock };
    subcontractorAssignment: { upsert: jest.Mock; findFirst: jest.Mock; delete: jest.Mock; count: jest.Mock; update: jest.Mock };
    subcontractorDocument: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; delete: jest.Mock };
    subcontractorCost: { aggregate: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
    subcontractorPerformanceReview: { create: jest.Mock; findMany: jest.Mock };
    subcontractorPayment: { create: jest.Mock; findMany: jest.Mock; groupBy: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let prequalification: { getCurrentValid: jest.Mock };

  beforeEach(async () => {
    prisma = {
      subcontractor: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      project: { findFirst: jest.fn() },
      subcontractorAssignment: { upsert: jest.fn(), findFirst: jest.fn(), delete: jest.fn(), count: jest.fn(), update: jest.fn() },
      subcontractorDocument: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
      subcontractorCost: { aggregate: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
      subcontractorPerformanceReview: { create: jest.fn(), findMany: jest.fn() },
      subcontractorPayment: { create: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
      company: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ requireSubcontractorPrequalification: false, subcontractorEmrThreshold: null }),
      },
    };
    audit = { record: jest.fn() };
    prequalification = { getCurrentValid: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SubcontractorsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: SubcontractorPrequalificationService, useValue: prequalification },
      ],
    }).compile();

    service = module.get(SubcontractorsService);
  });

  describe("assign()", () => {
    it("rejects a subcontractorId that belongs to another company", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue(null);

      await expect(service.assign(COMPANY_A, "foreign-sub", "project-1")).rejects.toThrow(NotFoundException);
      expect(prisma.subcontractorAssignment.upsert).not.toHaveBeenCalled();
    });

    it("rejects a projectId that belongs to another company", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", companyId: COMPANY_A, name: "Acme Electric" });
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.assign(COMPANY_A, "sub-1", "foreign-project")).rejects.toThrow(NotFoundException);
      expect(prisma.subcontractorAssignment.upsert).not.toHaveBeenCalled();
    });

    it("blocks assignment when the subcontractor has no compliance documents on file", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", companyId: COMPANY_A, name: "Acme Electric" });
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A });
      prisma.subcontractorDocument.findMany.mockResolvedValue([]);

      await expect(service.assign(COMPANY_A, "sub-1", "project-1")).rejects.toThrow(BadRequestException);
      expect(prisma.subcontractorAssignment.upsert).not.toHaveBeenCalled();
    });

    it("blocks assignment when only one of the two required documents is current", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", companyId: COMPANY_A, name: "Acme Electric" });
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A });
      prisma.subcontractorDocument.findMany.mockResolvedValue([
        { id: "doc-1", type: "general_liability_insurance", expiresAt: daysFromNow(60) },
      ]);

      await expect(service.assign(COMPANY_A, "sub-1", "project-1")).rejects.toThrow(BadRequestException);
    });

    it("allows assignment once both required documents are current", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", companyId: COMPANY_A, name: "Acme Electric" });
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A });
      prisma.subcontractorDocument.findMany.mockResolvedValue([
        { id: "doc-1", type: "general_liability_insurance", expiresAt: daysFromNow(60) },
        { id: "doc-2", type: "workers_comp_insurance", expiresAt: daysFromNow(90) },
      ]);
      prisma.subcontractorAssignment.upsert.mockResolvedValue({ id: "assign-1" });

      await service.assign(COMPANY_A, "sub-1", "project-1");

      expect(prisma.subcontractorAssignment.upsert).toHaveBeenCalled();
    });

    it("persists an optional schedule date range on the assignment", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", companyId: COMPANY_A, name: "Acme Electric" });
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A });
      prisma.subcontractorDocument.findMany.mockResolvedValue([
        { id: "doc-1", type: "general_liability_insurance", expiresAt: daysFromNow(60) },
        { id: "doc-2", type: "workers_comp_insurance", expiresAt: daysFromNow(90) },
      ]);
      prisma.subcontractorAssignment.upsert.mockResolvedValue({ id: "assign-1" });

      await service.assign(COMPANY_A, "sub-1", "project-1", "2026-09-01T00:00:00.000Z", "2026-09-15T00:00:00.000Z");

      expect(prisma.subcontractorAssignment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ startDate: new Date("2026-09-01T00:00:00.000Z"), endDate: new Date("2026-09-15T00:00:00.000Z") }),
          update: { startDate: new Date("2026-09-01T00:00:00.000Z"), endDate: new Date("2026-09-15T00:00:00.000Z") },
        }),
      );
    });

    describe("subcontractor safety gate", () => {
      function mockCompliantDocs() {
        prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", companyId: COMPANY_A, name: "Acme Electric" });
        prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A });
        prisma.subcontractorDocument.findMany.mockResolvedValue([
          { id: "doc-1", type: "general_liability_insurance", expiresAt: daysFromNow(60) },
          { id: "doc-2", type: "workers_comp_insurance", expiresAt: daysFromNow(90) },
        ]);
        prisma.subcontractorAssignment.upsert.mockResolvedValue({ id: "assign-1" });
      }

      it("skips the gate entirely when neither requirement nor EMR threshold is configured", async () => {
        mockCompliantDocs();

        await service.assign(COMPANY_A, "sub-1", "project-1");

        expect(prequalification.getCurrentValid).not.toHaveBeenCalled();
      });

      it("blocks assignment when prequalification is required but none is on file", async () => {
        mockCompliantDocs();
        prisma.company.findUniqueOrThrow.mockResolvedValue({ requireSubcontractorPrequalification: true, subcontractorEmrThreshold: null });
        prequalification.getCurrentValid.mockResolvedValue(null);

        await expect(service.assign(COMPANY_A, "sub-1", "project-1")).rejects.toThrow(BadRequestException);
        expect(prisma.subcontractorAssignment.upsert).not.toHaveBeenCalled();
      });

      it("allows assignment when prequalification is required and a current one is on file", async () => {
        mockCompliantDocs();
        prisma.company.findUniqueOrThrow.mockResolvedValue({ requireSubcontractorPrequalification: true, subcontractorEmrThreshold: null });
        prequalification.getCurrentValid.mockResolvedValue({ id: "pq-1", safetyEmrRating: null });

        await service.assign(COMPANY_A, "sub-1", "project-1");

        expect(prisma.subcontractorAssignment.upsert).toHaveBeenCalled();
      });

      it("blocks assignment when the current EMR exceeds the company threshold", async () => {
        mockCompliantDocs();
        prisma.company.findUniqueOrThrow.mockResolvedValue({ requireSubcontractorPrequalification: false, subcontractorEmrThreshold: "1.0" });
        prequalification.getCurrentValid.mockResolvedValue({ id: "pq-1", safetyEmrRating: "1.5" });

        await expect(service.assign(COMPANY_A, "sub-1", "project-1")).rejects.toThrow(BadRequestException);
      });

      it("allows assignment when the current EMR is at or under the company threshold", async () => {
        mockCompliantDocs();
        prisma.company.findUniqueOrThrow.mockResolvedValue({ requireSubcontractorPrequalification: false, subcontractorEmrThreshold: "1.0" });
        prequalification.getCurrentValid.mockResolvedValue({ id: "pq-1", safetyEmrRating: "1.0" });

        await service.assign(COMPANY_A, "sub-1", "project-1");

        expect(prisma.subcontractorAssignment.upsert).toHaveBeenCalled();
      });

      it("does not block on EMR when a threshold is set but no prequalification exists and none is required", async () => {
        mockCompliantDocs();
        prisma.company.findUniqueOrThrow.mockResolvedValue({ requireSubcontractorPrequalification: false, subcontractorEmrThreshold: "1.0" });
        prequalification.getCurrentValid.mockResolvedValue(null);

        await service.assign(COMPANY_A, "sub-1", "project-1");

        expect(prisma.subcontractorAssignment.upsert).toHaveBeenCalled();
      });
    });
  });

  describe("unassign()", () => {
    it("rejects an assignment that doesn't belong to this company's subcontractor", async () => {
      prisma.subcontractorAssignment.findFirst.mockResolvedValue(null);

      await expect(service.unassign(COMPANY_A, "sub-1", "foreign-assignment")).rejects.toThrow(NotFoundException);
      expect(prisma.subcontractorAssignment.delete).not.toHaveBeenCalled();
    });
  });

  describe("complianceStatus()", () => {
    it("reports missing, expired, and valid per requirement independently", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", companyId: COMPANY_A, name: "Acme Electric" });
      prisma.subcontractorDocument.findMany.mockResolvedValue([
        { id: "doc-1", type: "general_liability_insurance", expiresAt: daysFromNow(-10) },
      ]);

      const result = await service.complianceStatus(COMPANY_A, "sub-1");

      expect(result.compliant).toBe(false);
      const byType = Object.fromEntries(result.requirements.map((r) => [r.type, r.status]));
      expect(byType.general_liability_insurance).toBe("expired");
      expect(byType.workers_comp_insurance).toBe("missing");
    });

    it("is compliant when both required documents are current", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", companyId: COMPANY_A, name: "Acme Electric" });
      prisma.subcontractorDocument.findMany.mockResolvedValue([
        { id: "doc-1", type: "general_liability_insurance", expiresAt: daysFromNow(60) },
        { id: "doc-2", type: "workers_comp_insurance", expiresAt: daysFromNow(90) },
      ]);

      const result = await service.complianceStatus(COMPANY_A, "sub-1");

      expect(result.compliant).toBe(true);
    });
  });

  describe("addDocument()", () => {
    it("rejects when the subcontractor does not belong to this company", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue(null);

      await expect(
        service.addDocument(COMPANY_A, ACTOR, "sub-1", {
          type: "general_liability_insurance",
          name: "GL Policy",
          expiresAt: daysFromNow(365).toISOString(),
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.subcontractorDocument.create).not.toHaveBeenCalled();
    });

    it("records an audit entry on success", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", companyId: COMPANY_A, name: "Acme Electric" });
      prisma.subcontractorDocument.create.mockResolvedValue({ id: "doc-1", expiresAt: daysFromNow(365) });

      await service.addDocument(COMPANY_A, ACTOR, "sub-1", {
        type: "general_liability_insurance",
        name: "GL Policy",
        expiresAt: daysFromNow(365).toISOString(),
      });

      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe("deleteDocument()", () => {
    it("rejects deleting a document that doesn't belong to this company's subcontractor", async () => {
      prisma.subcontractorDocument.findFirst.mockResolvedValue(null);

      await expect(service.deleteDocument(COMPANY_A, "sub-1", "doc-1")).rejects.toThrow(NotFoundException);
      expect(prisma.subcontractorDocument.delete).not.toHaveBeenCalled();
    });
  });

  describe("setPublicListed()", () => {
    it("rejects a subcontractor that doesn't belong to this company", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue(null);

      await expect(service.setPublicListed(COMPANY_A, "sub-1", true)).rejects.toThrow(NotFoundException);
      expect(prisma.subcontractor.update).not.toHaveBeenCalled();
    });

    it("generates a token the first time a subcontractor is made public", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", companyId: COMPANY_A, publicToken: null });
      prisma.subcontractor.update.mockResolvedValue({ id: "sub-1", publicListed: true, publicToken: "generated" });

      await service.setPublicListed(COMPANY_A, "sub-1", true);

      const call = prisma.subcontractor.update.mock.calls[0][0];
      expect(call.data.publicListed).toBe(true);
      expect(typeof call.data.publicToken).toBe("string");
      expect(call.data.publicToken.length).toBeGreaterThan(0);
    });

    it("keeps the existing token when re-enabling after it was already generated once", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", companyId: COMPANY_A, publicToken: "existing-token" });
      prisma.subcontractor.update.mockResolvedValue({});

      await service.setPublicListed(COMPANY_A, "sub-1", true);

      expect(prisma.subcontractor.update).toHaveBeenCalledWith({
        where: { id: "sub-1" },
        data: { publicListed: true, publicToken: "existing-token" },
      });
    });
  });

  describe("getPublicProfile()", () => {
    it("rejects an unknown or unlisted token", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue(null);

      await expect(service.getPublicProfile("bad-token")).rejects.toThrow(NotFoundException);
    });

    it("returns the sub's track record with this company, not a cross-company rating", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({
        id: "sub-1",
        name: "Acme Electric",
        specialization: "Electrical",
        bio: "Reliable and fast.",
        company: { name: "Riverside Builders" },
      });
      prisma.subcontractorAssignment.count.mockResolvedValue(4);
      prisma.subcontractorCost.aggregate.mockResolvedValue({ _sum: { amount: "15000.00" } });

      const result = await service.getPublicProfile("good-token");

      expect(result).toEqual({
        name: "Acme Electric",
        specialization: "Electrical",
        bio: "Reliable and fast.",
        referencedBy: "Riverside Builders",
        projectsWorked: 4,
        totalPaidOut: 15000,
      });
    });
  });

  describe("addPerformanceReview() / performanceScorecard()", () => {
    it("throws when the subcontractor doesn't belong to this company", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue(null);

      await expect(service.addPerformanceReview(COMPANY_A, ACTOR, "sub-1", { rating: 5, safetyIncidents: 0, reworkCount: 0 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws when the referenced assignment doesn't belong to this subcontractor/company", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", name: "Acme Electric" });
      prisma.subcontractorAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.addPerformanceReview(COMPANY_A, ACTOR, "sub-1", { assignmentId: "assign-1", rating: 4, safetyIncidents: 0, reworkCount: 0 }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.subcontractorPerformanceReview.create).not.toHaveBeenCalled();
    });

    it("records a review with the reviewer's identity", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", name: "Acme Electric" });
      prisma.subcontractorPerformanceReview.create.mockResolvedValue({ id: "review-1" });

      await service.addPerformanceReview(COMPANY_A, ACTOR, "sub-1", {
        rating: 4,
        onTime: true,
        safetyIncidents: 0,
        reworkCount: 1,
        wouldHireAgain: true,
        comments: "Solid work, one punch item.",
      });

      expect(prisma.subcontractorPerformanceReview.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: COMPANY_A,
          subcontractorId: "sub-1",
          reviewedByUserId: ACTOR.userId,
          reviewedByName: ACTOR.name,
          rating: 4,
          onTime: true,
          reworkCount: 1,
          wouldHireAgain: true,
        }),
      });
    });

    it("returns nulls (not zeros or NaN) when no reviews exist yet", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1" });
      prisma.subcontractorPerformanceReview.findMany.mockResolvedValue([]);

      const result = await service.performanceScorecard(COMPANY_A, "sub-1");

      expect(result).toEqual({
        reviewCount: 0,
        averageRating: null,
        onTimePercent: null,
        wouldHireAgainPercent: null,
        totalSafetyIncidents: 0,
        totalReworkCount: 0,
      });
    });

    it("aggregates rating/on-time%/would-hire-again% across multiple reviews", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1" });
      prisma.subcontractorPerformanceReview.findMany.mockResolvedValue([
        { rating: 5, onTime: true, wouldHireAgain: true, safetyIncidents: 0, reworkCount: 0 },
        { rating: 3, onTime: false, wouldHireAgain: true, safetyIncidents: 1, reworkCount: 2 },
        { rating: 4, onTime: true, wouldHireAgain: null, safetyIncidents: 0, reworkCount: 0 },
      ]);

      const result = await service.performanceScorecard(COMPANY_A, "sub-1");

      expect(result.reviewCount).toBe(3);
      expect(result.averageRating).toBeCloseTo(4, 1);
      // 2 of 3 on-time answered "true" -> 66.7%
      expect(result.onTimePercent).toBeCloseTo(66.7, 1);
      // Of the 2 reviews that answered wouldHireAgain, both were true -> 100%
      expect(result.wouldHireAgainPercent).toBe(100);
      expect(result.totalSafetyIncidents).toBe(1);
      expect(result.totalReworkCount).toBe(2);
    });
  });

  describe("setActualEndDate()", () => {
    it("throws when the assignment doesn't belong to this subcontractor/company", async () => {
      prisma.subcontractorAssignment.findFirst.mockResolvedValue(null);

      await expect(service.setActualEndDate(COMPANY_A, "sub-1", "assign-1", "2026-09-01T00:00:00.000Z")).rejects.toThrow(NotFoundException);
    });

    it("clears the date when passed null", async () => {
      prisma.subcontractorAssignment.findFirst.mockResolvedValue({ id: "assign-1" });

      await service.setActualEndDate(COMPANY_A, "sub-1", "assign-1", null);

      expect(prisma.subcontractorAssignment.update).toHaveBeenCalledWith({ where: { id: "assign-1" }, data: { actualEndDate: null } });
    });
  });

  describe("list()", () => {
    it("never selects taxId", async () => {
      prisma.subcontractor.findMany.mockResolvedValue([]);

      await service.list(COMPANY_A);

      const call = prisma.subcontractor.findMany.mock.calls[0][0];
      expect(call.select.taxId).toBeUndefined();
      expect(call.select.name).toBe(true);
    });
  });

  describe("getTaxProfile() / updateTaxProfile()", () => {
    it("throws when the subcontractor doesn't belong to this company", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue(null);

      await expect(service.getTaxProfile(COMPANY_A, "sub-1")).rejects.toThrow(NotFoundException);
    });

    it("returns the raw (unmasked) taxId — this is the one place it's allowed to leave the server unmasked", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ taxId: "12-3456789", legalBusinessName: "Acme Electric LLC", mailingAddress: "1 Main St" });

      const result = await service.getTaxProfile(COMPANY_A, "sub-1");

      expect(result.taxId).toBe("12-3456789");
    });

    it("updateTaxProfile() rejects a subcontractor from another company", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue(null);

      await expect(service.updateTaxProfile(COMPANY_A, "sub-1", { taxId: "12-3456789" })).rejects.toThrow(NotFoundException);
      expect(prisma.subcontractor.update).not.toHaveBeenCalled();
    });

    // Regression: the select clause here once listed only taxId/legalBusinessName/mailingAddress,
    // so adding datevKreditorNumber to the model silently never came back from this endpoint even
    // though it saved correctly — caught by hand while browser-testing the DATEV export feature.
    it("selects datevKreditorNumber, not just the US tax-profile fields", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ taxId: null, legalBusinessName: null, mailingAddress: null, datevKreditorNumber: "70001" });

      const result = await service.getTaxProfile(COMPANY_A, "sub-1");

      expect(prisma.subcontractor.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ select: expect.objectContaining({ datevKreditorNumber: true }) }),
      );
      expect(result.datevKreditorNumber).toBe("70001");
    });
  });

  describe("addPayment()", () => {
    it("rejects when the subcontractor doesn't belong to this company", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue(null);

      await expect(service.addPayment(COMPANY_A, ACTOR, "sub-1", { amount: 500 })).rejects.toThrow(NotFoundException);
      expect(prisma.subcontractorPayment.create).not.toHaveBeenCalled();
    });

    it("rejects a subcontractorCostId that doesn't belong to this subcontractor/company", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", name: "Acme Electric" });
      prisma.subcontractorCost.findFirst.mockResolvedValue(null);

      await expect(service.addPayment(COMPANY_A, ACTOR, "sub-1", { amount: 500, subcontractorCostId: "cost-1" })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.subcontractorPayment.create).not.toHaveBeenCalled();
    });

    it("records a standalone payment with no subcontractorCostId", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", name: "Acme Electric" });
      prisma.subcontractorPayment.create.mockResolvedValue({ id: "payment-1" });

      await service.addPayment(COMPANY_A, ACTOR, "sub-1", { amount: 1200, note: "Retainage release" });

      expect(prisma.subcontractorPayment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ companyId: COMPANY_A, subcontractorId: "sub-1", amount: 1200, note: "Retainage release" }),
      });
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe("taxSummary()", () => {
    it("returns an empty list when no payments fall in the year", async () => {
      prisma.subcontractorPayment.groupBy.mockResolvedValue([]);

      const result = await service.taxSummary(COMPANY_A, 2026);

      expect(result).toEqual([]);
      expect(prisma.subcontractor.findMany).not.toHaveBeenCalled();
    });

    it("masks taxId to last-4 and flags the $600 reportable threshold", async () => {
      prisma.subcontractorPayment.groupBy.mockResolvedValue([
        { subcontractorId: "sub-1", _sum: { amount: "1500.00" } },
        { subcontractorId: "sub-2", _sum: { amount: "200.00" } },
      ]);
      prisma.subcontractor.findMany.mockResolvedValue([
        { id: "sub-1", name: "Acme Electric", taxId: "12-3456789", legalBusinessName: "Acme Electric LLC", mailingAddress: "1 Main St" },
        { id: "sub-2", name: "Bolt Plumbing", taxId: null, legalBusinessName: null, mailingAddress: null },
      ]);

      const result = await service.taxSummary(COMPANY_A, 2026);

      expect(result).toEqual([
        expect.objectContaining({ subcontractorId: "sub-1", totalPaid: 1500, reportable: true, taxIdMasked: "***-**-6789" }),
        expect.objectContaining({ subcontractorId: "sub-2", totalPaid: 200, reportable: false, taxIdMasked: null }),
      ]);
    });

    it("scopes payments to the given calendar year", async () => {
      prisma.subcontractorPayment.groupBy.mockResolvedValue([]);

      await service.taxSummary(COMPANY_A, 2026);

      const call = prisma.subcontractorPayment.groupBy.mock.calls[0][0];
      expect(call.where.paidAt.gte).toEqual(new Date(Date.UTC(2026, 0, 1)));
      expect(call.where.paidAt.lt).toEqual(new Date(Date.UTC(2027, 0, 1)));
    });
  });

  describe("setDiversityCertifications()", () => {
    it("rejects a subcontractor that doesn't belong to this company", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue(null);
      await expect(service.setDiversityCertifications(COMPANY_A, ACTOR, "sub-1", { diversityCertifications: ["mbe"] })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("updates certifications and audits it", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", companyId: COMPANY_A, name: "Acme Electric" });
      prisma.subcontractor.update.mockResolvedValue({ id: "sub-1", diversityCertifications: ["mbe", "dbe"] });

      await service.setDiversityCertifications(COMPANY_A, ACTOR, "sub-1", { diversityCertifications: ["mbe", "dbe"] });

      expect(prisma.subcontractor.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ diversityCertifications: ["mbe", "dbe"] }) }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        COMPANY_A,
        ACTOR,
        "subcontractor.diversity_certifications_updated",
        "Subcontractor",
        "sub-1",
        expect.any(String),
      );
    });
  });

  describe("diversitySpendReport()", () => {
    it("rolls up paid spend by certification category", async () => {
      prisma.subcontractorCost.findMany.mockResolvedValue([
        { amount: "10000", subcontractor: { diversityCertifications: ["mbe"] } },
        { amount: "5000", subcontractor: { diversityCertifications: [] } },
      ]);

      const result = await service.diversitySpendReport(COMPANY_A);

      expect(result.totalSpend).toBe(15000);
      expect(result.certifiedSpend).toBe(10000);
      expect(prisma.subcontractorCost.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: COMPANY_A, paid: true } }));
    });

    it("scopes to a single project when given", async () => {
      prisma.subcontractorCost.findMany.mockResolvedValue([]);

      await service.diversitySpendReport(COMPANY_A, "project-1");

      expect(prisma.subcontractorCost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: COMPANY_A, paid: true, projectId: "project-1" } }),
      );
    });
  });
});
