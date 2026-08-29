import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { PermitsService } from "./permits.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("PermitsService", () => {
  let service: PermitsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    permit: { create: jest.Mock; update: jest.Mock; delete: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      permit: { create: jest.fn(), update: jest.fn(), delete: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [PermitsService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: { record: jest.fn() } }],
    }).compile();

    service = module.get(PermitsService);
  });

  describe("create()", () => {
    it("throws when the project doesn't belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.create(COMPANY_A, ACTOR, "project-1", { permitType: "Building" })).rejects.toThrow(NotFoundException);
    });

    it("defaults to draft status when no submittedAt is given", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", name: "Riverside" });
      prisma.permit.create.mockResolvedValue({ id: "permit-1" });

      await service.create(COMPANY_A, ACTOR, "project-1", { permitType: "Building" });

      expect(prisma.permit.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "draft" }) }));
    });

    it("defaults to submitted status when submittedAt is given", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", name: "Riverside" });
      prisma.permit.create.mockResolvedValue({ id: "permit-1" });

      await service.create(COMPANY_A, ACTOR, "project-1", { permitType: "Building", submittedAt: "2026-08-01T00:00:00.000Z" });

      expect(prisma.permit.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "submitted" }) }));
    });
  });

  describe("update()", () => {
    it("throws when the permit doesn't belong to this company", async () => {
      prisma.permit.findFirst.mockResolvedValue(null);
      await expect(service.update(COMPANY_A, "permit-1", { status: "approved" })).rejects.toThrow(NotFoundException);
    });

    it("clears expiringNotifiedAt when the expiry date is changed, so a new reminder can fire", async () => {
      prisma.permit.findFirst.mockResolvedValue({ id: "permit-1" });

      await service.update(COMPANY_A, "permit-1", { expiresAt: "2027-01-01T00:00:00.000Z" });

      expect(prisma.permit.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ expiringNotifiedAt: null }) }),
      );
    });

    it("leaves expiringNotifiedAt untouched when expiresAt isn't part of the update", async () => {
      prisma.permit.findFirst.mockResolvedValue({ id: "permit-1" });

      await service.update(COMPANY_A, "permit-1", { status: "approved" });

      const updateArg = prisma.permit.update.mock.calls[0][0];
      expect(updateArg.data.expiringNotifiedAt).toBeUndefined();
    });
  });
});
