import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SubcontractorsService } from "./subcontractors.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

describe("SubcontractorsService", () => {
  let service: SubcontractorsService;
  let prisma: {
    subcontractor: { findFirst: jest.Mock; update: jest.Mock };
    project: { findFirst: jest.Mock };
    subcontractorAssignment: { upsert: jest.Mock; findFirst: jest.Mock; delete: jest.Mock; count: jest.Mock };
    subcontractorDocument: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; delete: jest.Mock };
    subcontractorCost: { aggregate: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      subcontractor: { findFirst: jest.fn(), update: jest.fn() },
      project: { findFirst: jest.fn() },
      subcontractorAssignment: { upsert: jest.fn(), findFirst: jest.fn(), delete: jest.fn(), count: jest.fn() },
      subcontractorDocument: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
      subcontractorCost: { aggregate: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [SubcontractorsService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
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
});
