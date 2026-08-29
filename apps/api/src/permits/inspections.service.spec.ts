import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { InspectionsService } from "./inspections.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("InspectionsService", () => {
  let service: InspectionsService;
  let prisma: {
    permit: { findFirst: jest.Mock };
    inspection: { create: jest.Mock; update: jest.Mock; delete: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      permit: { findFirst: jest.fn() },
      inspection: { create: jest.fn(), update: jest.fn(), delete: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [InspectionsService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: { record: jest.fn() } }],
    }).compile();

    service = module.get(InspectionsService);
  });

  describe("create()", () => {
    it("throws when the permit doesn't belong to this company", async () => {
      prisma.permit.findFirst.mockResolvedValue(null);
      await expect(service.create(COMPANY_A, ACTOR, "permit-1", { inspectionType: "Rough-in" })).rejects.toThrow(NotFoundException);
    });

    it("creates an inspection with a free-text external inspector, not a Worker link", async () => {
      prisma.permit.findFirst.mockResolvedValue({ id: "permit-1", permitType: "Building", permitNumber: "B-123" });
      prisma.inspection.create.mockResolvedValue({ id: "insp-1" });

      await service.create(COMPANY_A, ACTOR, "permit-1", { inspectionType: "Rough-in", inspectorName: "Jane Doe (City)" });

      expect(prisma.inspection.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ inspectorName: "Jane Doe (City)" }) }),
      );
    });
  });

  describe("recordResult()", () => {
    it("throws when the inspection doesn't belong to this company", async () => {
      prisma.inspection.findFirst.mockResolvedValue(null);
      await expect(service.recordResult(COMPANY_A, ACTOR, "insp-1", { result: "passed" })).rejects.toThrow(NotFoundException);
    });

    it("sets completedAt when a terminal result is recorded", async () => {
      prisma.inspection.findFirst.mockResolvedValue({ id: "insp-1", inspectionType: "Final", notes: null });

      await service.recordResult(COMPANY_A, ACTOR, "insp-1", { result: "passed" });

      const updateArg = prisma.inspection.update.mock.calls[0][0];
      expect(updateArg.data.result).toBe("passed");
      expect(updateArg.data.completedAt).toBeInstanceOf(Date);
    });

    it("clears completedAt when reset back to pending", async () => {
      prisma.inspection.findFirst.mockResolvedValue({ id: "insp-1", inspectionType: "Final", notes: null });

      await service.recordResult(COMPANY_A, ACTOR, "insp-1", { result: "pending" });

      expect(prisma.inspection.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ completedAt: null }) }));
    });
  });
});
