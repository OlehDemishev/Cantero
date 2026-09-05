import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SubcontractorPrequalificationService } from "./subcontractor-prequalification.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("SubcontractorPrequalificationService", () => {
  let service: SubcontractorPrequalificationService;
  let prisma: {
    subcontractor: { findFirst: jest.Mock };
    subcontractorPrequalification: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      subcontractor: { findFirst: jest.fn() },
      subcontractorPrequalification: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SubcontractorPrequalificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(SubcontractorPrequalificationService);
  });

  describe("create()", () => {
    it("rejects a prequalification for a subcontractor that doesn't belong to the company", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue(null);
      await expect(service.create(COMPANY_A, ACTOR, "sub-1", {})).rejects.toThrow(NotFoundException);
    });

    it("creates a new pending cycle", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", name: "Acme Electric" });
      prisma.subcontractorPrequalification.create.mockResolvedValue({ id: "pq-1", status: "pending" });

      const result = await service.create(COMPANY_A, ACTOR, "sub-1", { licenseNumber: "EL-1234", yearsInBusiness: 12 });

      expect(result.status).toBe("pending");
      expect(prisma.subcontractorPrequalification.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ subcontractorId: "sub-1", licenseNumber: "EL-1234", yearsInBusiness: 12 }) }),
      );
    });
  });

  describe("decide()", () => {
    it("throws when the prequalification doesn't belong to the company", async () => {
      prisma.subcontractorPrequalification.findFirst.mockResolvedValue(null);
      await expect(
        service.decide(COMPANY_A, ACTOR, "pq-1", { status: "approved", reviewedByName: "Owner" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects deciding a cycle that has already been decided", async () => {
      prisma.subcontractorPrequalification.findFirst.mockResolvedValue({
        id: "pq-1",
        status: "approved",
        subcontractor: { name: "Acme Electric" },
      });
      await expect(
        service.decide(COMPANY_A, ACTOR, "pq-1", { status: "rejected", reviewedByName: "Owner" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("sets reviewedAt and expiresAt when approving", async () => {
      prisma.subcontractorPrequalification.findFirst.mockResolvedValue({
        id: "pq-1",
        status: "pending",
        subcontractor: { name: "Acme Electric" },
      });
      prisma.subcontractorPrequalification.update.mockResolvedValue({ id: "pq-1", status: "approved" });

      await service.decide(COMPANY_A, ACTOR, "pq-1", {
        status: "approved",
        score: 85,
        reviewedByName: "Owner",
        expiresAt: "2027-01-01T00:00:00.000Z",
      });

      const updateCall = prisma.subcontractorPrequalification.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe("approved");
      expect(updateCall.data.score).toBe(85);
      expect(updateCall.data.reviewedAt).toBeInstanceOf(Date);
      expect(updateCall.data.expiresAt).toEqual(new Date("2027-01-01T00:00:00.000Z"));
    });

    it("does not set expiresAt when rejecting", async () => {
      prisma.subcontractorPrequalification.findFirst.mockResolvedValue({
        id: "pq-1",
        status: "pending",
        subcontractor: { name: "Acme Electric" },
      });
      prisma.subcontractorPrequalification.update.mockResolvedValue({ id: "pq-1", status: "rejected" });

      await service.decide(COMPANY_A, ACTOR, "pq-1", { status: "rejected", reviewedByName: "Owner" });

      const updateCall = prisma.subcontractorPrequalification.update.mock.calls[0][0];
      expect(updateCall.data.expiresAt).toBeUndefined();
    });
  });

  describe("expiringSoon()", () => {
    it("scopes to approved prequalifications within the lookback window", async () => {
      prisma.subcontractorPrequalification.findMany.mockResolvedValue([]);

      await service.expiringSoon(COMPANY_A, 30);

      const call = prisma.subcontractorPrequalification.findMany.mock.calls[0][0];
      expect(call.where.status).toBe("approved");
      expect(call.where.expiresAt.lte).toBeInstanceOf(Date);
    });
  });

  describe("getCurrentValid()", () => {
    it("returns null when the subcontractor has never had a cycle", async () => {
      prisma.subcontractorPrequalification.findFirst.mockResolvedValue(null);
      expect(await service.getCurrentValid(COMPANY_A, "sub-1")).toBeNull();
    });

    it("returns null when the latest cycle isn't approved", async () => {
      prisma.subcontractorPrequalification.findFirst.mockResolvedValue({ id: "pq-1", status: "pending", expiresAt: null });
      expect(await service.getCurrentValid(COMPANY_A, "sub-1")).toBeNull();
    });

    it("returns null when the latest approved cycle has expired", async () => {
      prisma.subcontractorPrequalification.findFirst.mockResolvedValue({
        id: "pq-1",
        status: "approved",
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      expect(await service.getCurrentValid(COMPANY_A, "sub-1")).toBeNull();
    });

    it("returns the cycle when approved and not yet expired", async () => {
      const record = { id: "pq-1", status: "approved", expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) };
      prisma.subcontractorPrequalification.findFirst.mockResolvedValue(record);
      expect(await service.getCurrentValid(COMPANY_A, "sub-1")).toEqual(record);
    });

    it("returns the cycle when approved with no expiry date at all", async () => {
      const record = { id: "pq-1", status: "approved", expiresAt: null };
      prisma.subcontractorPrequalification.findFirst.mockResolvedValue(record);
      expect(await service.getCurrentValid(COMPANY_A, "sub-1")).toEqual(record);
    });
  });
});
