import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SustainabilityService } from "./sustainability.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("SustainabilityService", () => {
  let service: SustainabilityService;
  let prisma: {
    project: { findFirst: jest.Mock };
    projectGreenCertification: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; delete: jest.Mock };
    stockMovement: { findMany: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      projectGreenCertification: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
      stockMovement: { findMany: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [SustainabilityService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(SustainabilityService);
  });

  describe("addCertification()", () => {
    it("rejects a project that does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.addCertification(COMPANY_A, ACTOR, { projectId: "project-1", type: "leed_gold", name: "LEED Gold" }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.projectGreenCertification.create).not.toHaveBeenCalled();
    });
  });

  describe("deleteCertification()", () => {
    it("rejects a certification that does not belong to this company", async () => {
      prisma.projectGreenCertification.findFirst.mockResolvedValue(null);

      await expect(service.deleteCertification(COMPANY_A, "cert-1")).rejects.toThrow(NotFoundException);
      expect(prisma.projectGreenCertification.delete).not.toHaveBeenCalled();
    });
  });

  describe("carbonReport()", () => {
    it("computes total kg CO2e only from materials with a known footprint, tracking untracked ones separately", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      prisma.stockMovement.findMany.mockResolvedValue([
        {
          quantity: 10,
          materialCatalogItem: { id: "mat-1", code: "CONC", name: "Concrete", unit: "m3", carbonFootprintKgCo2e: 100, greenCertified: false, defaultUnitPrice: 50 },
        },
        {
          quantity: 5,
          materialCatalogItem: { id: "mat-2", code: "TIMBER", name: "Timber", unit: "m3", carbonFootprintKgCo2e: null, greenCertified: true, defaultUnitPrice: 20 },
        },
      ]);

      const result = await service.carbonReport(COMPANY_A, "project-1");

      expect(result.totalKgCo2e).toBe(1000);
      expect(result.untrackedMaterialCount).toBe(1);
      // green-certified cost (5*20=100) / total cost (10*50 + 5*20 = 600) * 100
      expect(result.greenCertifiedPercent).toBe(round(100 / 600 * 100));
    });

    it("rejects a project that does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.carbonReport(COMPANY_A, "project-1")).rejects.toThrow(NotFoundException);
    });

    it("aggregates quantity and footprint across multiple movements of the same material", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      prisma.stockMovement.findMany.mockResolvedValue([
        {
          quantity: 10,
          materialCatalogItem: { id: "mat-1", code: "CONC", name: "Concrete", unit: "m3", carbonFootprintKgCo2e: 100, greenCertified: false, defaultUnitPrice: 50 },
        },
        {
          quantity: 4,
          materialCatalogItem: { id: "mat-1", code: "CONC", name: "Concrete", unit: "m3", carbonFootprintKgCo2e: 100, greenCertified: false, defaultUnitPrice: 50 },
        },
      ]);

      const result = await service.carbonReport(COMPANY_A, "project-1");

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].quantity).toBe(14);
      expect(result.rows[0].kgCo2e).toBe(1400);
    });
  });
});

function round(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
