import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SubcontractorClaimsService } from "./subcontractor-claims.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("SubcontractorClaimsService", () => {
  let service: SubcontractorClaimsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    subcontractor: { findFirst: jest.Mock };
    punchListItem: { findFirst: jest.Mock };
    warrantyClaim: { findFirst: jest.Mock };
    subcontractorBackcharge: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    subcontractorDefaultNotice: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      subcontractor: { findFirst: jest.fn() },
      punchListItem: { findFirst: jest.fn() },
      warrantyClaim: { findFirst: jest.fn() },
      subcontractorBackcharge: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      subcontractorDefaultNotice: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [SubcontractorClaimsService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(SubcontractorClaimsService);
  });

  describe("createBackcharge()", () => {
    it("rejects a backcharge for a project that doesn't belong to the company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(
        service.createBackcharge(COMPANY_A, ACTOR, "project-1", { subcontractorId: "sub-1", description: "Rework", amount: 500 }),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects a backcharge for a subcontractor from another company", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      prisma.subcontractor.findFirst.mockResolvedValue(null);
      await expect(
        service.createBackcharge(COMPANY_A, ACTOR, "project-1", { subcontractorId: "sub-1", description: "Rework", amount: 500 }),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects a backcharge referencing a punch list item outside the project", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", name: "Acme Electric" });
      prisma.punchListItem.findFirst.mockResolvedValue(null);
      await expect(
        service.createBackcharge(COMPANY_A, ACTOR, "project-1", {
          subcontractorId: "sub-1",
          punchListItemId: "punch-1",
          description: "Rework",
          amount: 500,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects a backcharge referencing a warranty claim outside the project", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", name: "Acme Electric" });
      prisma.warrantyClaim.findFirst.mockResolvedValue(null);
      await expect(
        service.createBackcharge(COMPANY_A, ACTOR, "project-1", {
          subcontractorId: "sub-1",
          warrantyClaimId: "claim-1",
          description: "Repair recovery",
          amount: 500,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("links a valid warranty claim", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", name: "Acme Electric" });
      prisma.warrantyClaim.findFirst.mockResolvedValue({ id: "claim-1" });
      prisma.subcontractorBackcharge.create.mockResolvedValue({ id: "bc-1" });

      await service.createBackcharge(COMPANY_A, ACTOR, "project-1", {
        subcontractorId: "sub-1",
        warrantyClaimId: "claim-1",
        description: "Repair recovery",
        amount: 500,
      });

      expect(prisma.subcontractorBackcharge.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ warrantyClaimId: "claim-1" }) }),
      );
    });

    it("creates a backcharge and audits it", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", name: "Acme Electric" });
      prisma.subcontractorBackcharge.create.mockResolvedValue({ id: "bc-1" });

      await service.createBackcharge(COMPANY_A, ACTOR, "project-1", { subcontractorId: "sub-1", description: "Rework", amount: 500 });

      expect(prisma.subcontractorBackcharge.create).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        COMPANY_A,
        ACTOR,
        "subcontractor_backcharge.created",
        "SubcontractorBackcharge",
        "bc-1",
        expect.any(String),
      );
    });
  });

  describe("markBackchargeDeducted() / markBackchargeWaived()", () => {
    it("throws when the backcharge doesn't belong to the company", async () => {
      prisma.subcontractorBackcharge.findFirst.mockResolvedValue(null);
      await expect(service.markBackchargeDeducted(COMPANY_A, ACTOR, "bc-1")).rejects.toThrow(NotFoundException);
    });

    it("rejects resolving a backcharge that isn't pending", async () => {
      prisma.subcontractorBackcharge.findFirst.mockResolvedValue({ id: "bc-1", status: "deducted" });
      await expect(service.markBackchargeWaived(COMPANY_A, ACTOR, "bc-1")).rejects.toThrow(BadRequestException);
    });

    it("marks a pending backcharge as deducted", async () => {
      prisma.subcontractorBackcharge.findFirst.mockResolvedValue({ id: "bc-1", status: "pending" });
      prisma.subcontractorBackcharge.update.mockResolvedValue({ id: "bc-1", status: "deducted" });

      const result = await service.markBackchargeDeducted(COMPANY_A, ACTOR, "bc-1");

      expect(result.status).toBe("deducted");
    });
  });

  describe("createDefaultNotice()", () => {
    it("rejects a notice for a subcontractor from another company", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      prisma.subcontractor.findFirst.mockResolvedValue(null);
      await expect(
        service.createDefaultNotice(COMPANY_A, ACTOR, "project-1", { subcontractorId: "sub-1", title: "Abandonment", description: "Left site" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("computes a cure deadline when a cure period is given", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", name: "Acme Electric" });
      prisma.subcontractorDefaultNotice.create.mockResolvedValue({ id: "notice-1" });

      await service.createDefaultNotice(COMPANY_A, ACTOR, "project-1", {
        subcontractorId: "sub-1",
        title: "Abandonment",
        description: "Left site",
        curePeriodDays: 10,
      });

      const callArgs = prisma.subcontractorDefaultNotice.create.mock.calls[0][0];
      expect(callArgs.data.cureDeadline).toBeInstanceOf(Date);
    });
  });

  describe("markNoticeCured() / markNoticeTerminated()", () => {
    it("rejects resolving a notice that isn't issued", async () => {
      prisma.subcontractorDefaultNotice.findFirst.mockResolvedValue({ id: "notice-1", status: "cured" });
      await expect(service.markNoticeTerminated(COMPANY_A, ACTOR, "notice-1")).rejects.toThrow(BadRequestException);
    });

    it("marks an issued notice as cured", async () => {
      prisma.subcontractorDefaultNotice.findFirst.mockResolvedValue({ id: "notice-1", status: "issued" });
      prisma.subcontractorDefaultNotice.update.mockResolvedValue({ id: "notice-1", status: "cured" });

      const result = await service.markNoticeCured(COMPANY_A, ACTOR, "notice-1");

      expect(result.status).toBe("cured");
    });
  });
});
