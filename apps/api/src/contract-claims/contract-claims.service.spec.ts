import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ContractClaimsService } from "./contract-claims.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";

describe("ContractClaimsService", () => {
  let service: ContractClaimsService;
  let prisma: {
    contractClaim: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    contractClaimEvent: { findMany: jest.Mock; create: jest.Mock };
    project: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      contractClaim: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      contractClaimEvent: { findMany: jest.fn(), create: jest.fn() },
      project: { findFirst: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        ContractClaimsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(ContractClaimsService);
  });

  describe("create()", () => {
    it("rejects filing a claim against a project that doesn't belong to the company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, { name: "Owner" }, "proj-1", {
          type: "delay",
          title: "Weather delay",
          noticeDate: new Date().toISOString(),
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("creates the claim and logs a notice event", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "proj-1", name: "Site A" });
      prisma.contractClaim.create.mockResolvedValue({ id: "claim-1", title: "Weather delay" });

      const result = await service.create(COMPANY_A, { name: "Owner" }, "proj-1", {
        type: "delay",
        title: "Weather delay",
        noticeDate: new Date().toISOString(),
      });

      expect(result.id).toBe("claim-1");
      expect(prisma.contractClaimEvent.create).toHaveBeenCalledTimes(1);
      const call = prisma.contractClaimEvent.create.mock.calls[0][0];
      expect(call.data.description).toContain("Notice of claim served");
    });
  });

  describe("updateStatus()", () => {
    it("rejects changing the status of an already-resolved claim", async () => {
      prisma.contractClaim.findFirst.mockResolvedValue({ id: "claim-1", status: "resolved", title: "Weather delay" });

      await expect(service.updateStatus(COMPANY_A, { name: "Owner" }, "claim-1", { status: "negotiating" })).rejects.toThrow(BadRequestException);
    });

    it("updates status and logs an event", async () => {
      prisma.contractClaim.findFirst.mockResolvedValue({ id: "claim-1", status: "notice_given", title: "Weather delay" });
      prisma.contractClaim.update.mockResolvedValue({ id: "claim-1", status: "submitted" });

      const result = await service.updateStatus(COMPANY_A, { name: "Owner" }, "claim-1", { status: "submitted" });

      expect(result.status).toBe("submitted");
      expect(prisma.contractClaimEvent.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("resolve()", () => {
    it("rejects resolving an already-rejected claim", async () => {
      prisma.contractClaim.findFirst.mockResolvedValue({ id: "claim-1", status: "rejected", title: "Weather delay" });

      await expect(service.resolve(COMPANY_A, { name: "Owner" }, "claim-1", { resolution: "Paid in full" })).rejects.toThrow(BadRequestException);
    });

    it("resolves an open claim and stamps resolvedAt", async () => {
      prisma.contractClaim.findFirst.mockResolvedValue({ id: "claim-1", status: "negotiating", title: "Weather delay" });
      prisma.contractClaim.update.mockResolvedValue({ id: "claim-1", status: "resolved", resolution: "Paid in full" });

      const result = await service.resolve(COMPANY_A, { name: "Owner" }, "claim-1", { resolution: "Paid in full" });

      expect(result.status).toBe("resolved");
      const call = prisma.contractClaim.update.mock.calls[0][0];
      expect(call.data.status).toBe("resolved");
      expect(call.data.resolvedAt).toBeInstanceOf(Date);
    });
  });
});
