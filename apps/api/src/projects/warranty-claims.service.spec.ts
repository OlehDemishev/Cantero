import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { WarrantyClaimsService } from "./warranty-claims.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Office Manager" };

describe("WarrantyClaimsService", () => {
  let service: WarrantyClaimsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    worker: { findFirst: jest.Mock };
    warrantyClaim: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let webhooks: { trigger: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      worker: { findFirst: jest.fn() },
      warrantyClaim: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    audit = { record: jest.fn() };
    webhooks = { trigger: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        WarrantyClaimsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: WebhooksService, useValue: webhooks },
      ],
    }).compile();

    service = module.get(WarrantyClaimsService);
  });

  describe("create()", () => {
    it("rejects when the project does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.create(COMPANY_A, ACTOR, { projectId: "project-1", title: "Cracked grout" })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.warrantyClaim.create).not.toHaveBeenCalled();
    });

    it("rejects when the assignee worker does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A, name: "Site A" });
      prisma.worker.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, { projectId: "project-1", title: "Cracked grout", assigneeWorkerId: "worker-1" }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.warrantyClaim.create).not.toHaveBeenCalled();
    });

    it("triggers the warranty_claim.submitted webhook on success", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A, name: "Site A" });
      prisma.warrantyClaim.create.mockResolvedValue({ id: "claim-1", title: "Cracked grout", repairCost: null });

      await service.create(COMPANY_A, ACTOR, { projectId: "project-1", title: "Cracked grout" });

      expect(webhooks.trigger).toHaveBeenCalledWith(
        COMPANY_A,
        "warranty_claim.submitted",
        expect.objectContaining({ warrantyClaimId: "claim-1", projectId: "project-1" }),
      );
    });
  });

  describe("start()", () => {
    it("rejects starting a claim that isn't open", async () => {
      prisma.warrantyClaim.findFirst.mockResolvedValue({ id: "claim-1", companyId: COMPANY_A, status: "in_progress", title: "Cracked grout", backcharges: [] });

      await expect(service.start(COMPANY_A, ACTOR, "claim-1")).rejects.toThrow(BadRequestException);
      expect(prisma.warrantyClaim.update).not.toHaveBeenCalled();
    });
  });

  describe("resolve()", () => {
    it("rejects resolving an already-closed claim", async () => {
      prisma.warrantyClaim.findFirst.mockResolvedValue({ id: "claim-1", companyId: COMPANY_A, status: "denied", title: "Cracked grout", backcharges: [] });

      await expect(service.resolve(COMPANY_A, ACTOR, "claim-1", {})).rejects.toThrow(BadRequestException);
      expect(prisma.warrantyClaim.update).not.toHaveBeenCalled();
    });

    it("resolves an in-progress claim and triggers the webhook", async () => {
      prisma.warrantyClaim.findFirst.mockResolvedValue({ id: "claim-1", companyId: COMPANY_A, status: "in_progress", title: "Cracked grout", backcharges: [] });
      prisma.warrantyClaim.update.mockResolvedValue({ id: "claim-1", status: "resolved", repairCost: "800", backcharges: [] });

      await service.resolve(COMPANY_A, ACTOR, "claim-1", { resolutionNotes: "Re-grouted", repairCost: 800 });

      expect(prisma.warrantyClaim.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "resolved", resolutionNotes: "Re-grouted", repairCost: 800 }) }),
      );
      expect(webhooks.trigger).toHaveBeenCalledWith(COMPANY_A, "warranty_claim.resolved", expect.objectContaining({ warrantyClaimId: "claim-1" }));
    });
  });

  describe("deny()", () => {
    it("rejects denying an already-closed claim", async () => {
      prisma.warrantyClaim.findFirst.mockResolvedValue({ id: "claim-1", companyId: COMPANY_A, status: "resolved", title: "Cracked grout", backcharges: [] });

      await expect(service.deny(COMPANY_A, ACTOR, "claim-1", { denialReason: "Not a defect" })).rejects.toThrow(BadRequestException);
      expect(prisma.warrantyClaim.update).not.toHaveBeenCalled();
    });

    it("denies an open claim and triggers the webhook", async () => {
      prisma.warrantyClaim.findFirst.mockResolvedValue({ id: "claim-1", companyId: COMPANY_A, status: "open", title: "Cracked grout", backcharges: [] });
      prisma.warrantyClaim.update.mockResolvedValue({ id: "claim-1", status: "denied", backcharges: [] });

      await service.deny(COMPANY_A, ACTOR, "claim-1", { denialReason: "Normal wear, not covered" });

      expect(webhooks.trigger).toHaveBeenCalledWith(COMPANY_A, "warranty_claim.denied", expect.objectContaining({ warrantyClaimId: "claim-1" }));
    });
  });

  describe("reopen()", () => {
    it("rejects reopening a claim that isn't closed", async () => {
      prisma.warrantyClaim.findFirst.mockResolvedValue({ id: "claim-1", companyId: COMPANY_A, status: "open", title: "Cracked grout", backcharges: [] });

      await expect(service.reopen(COMPANY_A, ACTOR, "claim-1")).rejects.toThrow(BadRequestException);
      expect(prisma.warrantyClaim.update).not.toHaveBeenCalled();
    });
  });

  describe("bulkStart()", () => {
    it("starts every open claim and reports failures for claims already in progress", async () => {
      const claims: Record<string, { id: string; companyId: string; status: string; title: string; backcharges: never[] }> = {
        "claim-1": { id: "claim-1", companyId: COMPANY_A, status: "open", title: "Cracked grout", backcharges: [] },
        "claim-2": { id: "claim-2", companyId: COMPANY_A, status: "in_progress", title: "Leaky faucet", backcharges: [] },
      };
      prisma.warrantyClaim.findFirst.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(claims[where.id] ?? null));
      prisma.warrantyClaim.update.mockResolvedValue({ id: "claim-1", status: "in_progress", backcharges: [] });

      const result = await service.bulkStart(COMPANY_A, ACTOR, ["claim-1", "claim-2"]);

      expect(result.succeeded).toBe(1);
      expect(result.failed).toEqual([{ id: "claim-2", message: "Claim is already in_progress" }]);
      expect(prisma.warrantyClaim.update).toHaveBeenCalledTimes(1);
    });
  });
});
