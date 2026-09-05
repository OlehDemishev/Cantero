import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { EstimateAlternatesService } from "./estimate-alternates.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Estimator" };

describe("EstimateAlternatesService", () => {
  let service: EstimateAlternatesService;
  let prisma: {
    estimate: { findFirst: jest.Mock };
    estimateAlternate: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      estimate: { findFirst: jest.fn() },
      estimateAlternate: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [EstimateAlternatesService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(EstimateAlternatesService);
  });

  describe("listForEstimate()", () => {
    it("throws when the estimate doesn't belong to the company", async () => {
      prisma.estimate.findFirst.mockResolvedValue(null);
      await expect(service.listForEstimate(COMPANY_A, "est-1")).rejects.toThrow(NotFoundException);
    });

    it("rolls up accepted total alongside the raw list", async () => {
      prisma.estimate.findFirst.mockResolvedValue({ id: "est-1" });
      prisma.estimateAlternate.findMany.mockResolvedValue([
        { id: "alt-1", status: "accepted", amount: "4200" },
        { id: "alt-2", status: "rejected", amount: "900" },
      ]);

      const result = await service.listForEstimate(COMPANY_A, "est-1");

      expect(result.acceptedTotal).toBe(4200);
      expect(result.alternates).toHaveLength(2);
    });
  });

  describe("create()", () => {
    it("rejects an alternate for an estimate that doesn't belong to the company", async () => {
      prisma.estimate.findFirst.mockResolvedValue(null);
      await expect(service.create(COMPANY_A, ACTOR, "est-1", { title: "Metal roof upgrade", amount: 4200 })).rejects.toThrow(NotFoundException);
    });

    it("creates an alternate and audits it", async () => {
      prisma.estimate.findFirst.mockResolvedValue({ id: "est-1", name: "Kitchen remodel" });
      prisma.estimateAlternate.create.mockResolvedValue({ id: "alt-1" });

      await service.create(COMPANY_A, ACTOR, "est-1", { title: "Metal roof upgrade", amount: 4200 });

      expect(prisma.estimateAlternate.create).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(COMPANY_A, ACTOR, "estimate_alternate.created", "EstimateAlternate", "alt-1", expect.any(String));
    });
  });

  describe("decide()", () => {
    it("throws when the alternate doesn't belong to the company", async () => {
      prisma.estimateAlternate.findFirst.mockResolvedValue(null);
      await expect(service.decide(COMPANY_A, ACTOR, "alt-1", { status: "accepted" })).rejects.toThrow(NotFoundException);
    });

    it("rejects deciding an already-decided alternate", async () => {
      prisma.estimateAlternate.findFirst.mockResolvedValue({ id: "alt-1", status: "accepted" });
      await expect(service.decide(COMPANY_A, ACTOR, "alt-1", { status: "rejected" })).rejects.toThrow(BadRequestException);
    });

    it("accepts a pending alternate", async () => {
      prisma.estimateAlternate.findFirst.mockResolvedValue({ id: "alt-1", status: "pending", title: "Metal roof upgrade" });
      prisma.estimateAlternate.update.mockResolvedValue({ id: "alt-1", status: "accepted" });

      const result = await service.decide(COMPANY_A, ACTOR, "alt-1", { status: "accepted" });

      expect(result.status).toBe("accepted");
    });
  });
});
