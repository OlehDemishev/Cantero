import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DeficienciesService } from "./deficiencies.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Inspector" };

describe("DeficienciesService", () => {
  let service: DeficienciesService;
  let prisma: {
    project: { findFirst: jest.Mock };
    worker: { findFirst: jest.Mock };
    deficiency: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: "p-1", companyId: COMPANY_A }) },
      worker: { findFirst: jest.fn() },
      deficiency: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [DeficienciesService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(DeficienciesService);
  });

  describe("createFromItem()", () => {
    it("falls back to the checklist item's own description when none is overridden", async () => {
      prisma.deficiency.create.mockResolvedValue({ id: "d-1", description: "Loose GFCI outlet" });

      await service.createFromItem(COMPANY_A, ACTOR, "p-1", "item-1", "Loose GFCI outlet", { severity: "major" });

      expect(prisma.deficiency.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ description: "Loose GFCI outlet", severity: "major" }) }),
      );
    });

    it("rejects an assignee that does not belong to this company", async () => {
      prisma.worker.findFirst.mockResolvedValue(null);

      await expect(
        service.createFromItem(COMPANY_A, ACTOR, "p-1", "item-1", "Default", { severity: "minor", assigneeWorkerId: "w-x" }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.deficiency.create).not.toHaveBeenCalled();
    });
  });

  describe("resolve() / verify() / reopen()", () => {
    it("rejects resolving a deficiency that isn't open", async () => {
      prisma.deficiency.findFirst.mockResolvedValue({ id: "d-1", companyId: COMPANY_A, status: "resolved", description: "X" });

      await expect(service.resolve(COMPANY_A, ACTOR, "d-1")).rejects.toThrow(BadRequestException);
      expect(prisma.deficiency.update).not.toHaveBeenCalled();
    });

    it("rejects verifying a deficiency that hasn't been resolved yet", async () => {
      prisma.deficiency.findFirst.mockResolvedValue({ id: "d-1", companyId: COMPANY_A, status: "open", description: "X" });

      await expect(service.verify(COMPANY_A, ACTOR, "d-1")).rejects.toThrow(BadRequestException);
      expect(prisma.deficiency.update).not.toHaveBeenCalled();
    });

    it("moves open -> resolved -> verified through the full two-step closeout", async () => {
      prisma.deficiency.findFirst.mockResolvedValueOnce({ id: "d-1", companyId: COMPANY_A, status: "open", description: "X" });
      prisma.deficiency.update.mockResolvedValueOnce({ id: "d-1", status: "resolved" });
      await service.resolve(COMPANY_A, ACTOR, "d-1");
      expect(prisma.deficiency.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "resolved" }) }));

      prisma.deficiency.findFirst.mockResolvedValueOnce({ id: "d-1", companyId: COMPANY_A, status: "resolved", description: "X" });
      prisma.deficiency.update.mockResolvedValueOnce({ id: "d-1", status: "verified" });
      await service.verify(COMPANY_A, ACTOR, "d-1");
      expect(prisma.deficiency.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "verified" }) }));
    });

    it("rejects reopening a deficiency that's already open", async () => {
      prisma.deficiency.findFirst.mockResolvedValue({ id: "d-1", companyId: COMPANY_A, status: "open", description: "X" });

      await expect(service.reopen(COMPANY_A, ACTOR, "d-1")).rejects.toThrow(BadRequestException);
    });

    it("clears resolvedAt/verifiedAt when reopening", async () => {
      prisma.deficiency.findFirst.mockResolvedValue({ id: "d-1", companyId: COMPANY_A, status: "verified", description: "X" });
      prisma.deficiency.update.mockResolvedValue({ id: "d-1", status: "open" });

      await service.reopen(COMPANY_A, ACTOR, "d-1");

      expect(prisma.deficiency.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "open", resolvedAt: null, verifiedAt: null } }),
      );
    });
  });
});
