import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { WarrantyRegistryService } from "./warranty-registry.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";

describe("WarrantyRegistryService", () => {
  let service: WarrantyRegistryService;
  let prisma: {
    warrantyRegistration: { findMany: jest.Mock; create: jest.Mock };
    project: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      warrantyRegistration: { findMany: jest.fn(), create: jest.fn() },
      project: { findFirst: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        WarrantyRegistryService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(WarrantyRegistryService);
  });

  describe("create()", () => {
    it("rejects a project that doesn't belong to the company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, { name: "Owner" }, "proj-1", { scope: "Roofing", termMonths: 24, startDate: new Date().toISOString() }),
      ).rejects.toThrow(NotFoundException);
    });

    it("computes expirationDate as startDate plus termMonths", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "proj-1", name: "Site A" });
      prisma.warrantyRegistration.create.mockResolvedValue({ id: "reg-1" });

      await service.create(COMPANY_A, { name: "Owner" }, "proj-1", {
        scope: "Roofing",
        termMonths: 24,
        startDate: "2026-01-15T00:00:00.000Z",
      });

      const call = prisma.warrantyRegistration.create.mock.calls[0][0];
      expect(call.data.startDate).toEqual(new Date("2026-01-15T00:00:00.000Z"));
      expect(call.data.expirationDate).toEqual(new Date("2028-01-15T00:00:00.000Z"));
    });
  });

  describe("expiringWithin()", () => {
    it("queries for registrations expiring by the given cutoff", async () => {
      prisma.warrantyRegistration.findMany.mockResolvedValue([]);

      await service.expiringWithin(COMPANY_A, 90);

      const call = prisma.warrantyRegistration.findMany.mock.calls[0][0];
      expect(call.where.companyId).toBe(COMPANY_A);
      expect(call.where.expirationDate.lte).toBeInstanceOf(Date);
    });
  });
});
