import { Test } from "@nestjs/testing";
import { HazmatService } from "./hazmat.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";

describe("HazmatService", () => {
  let service: HazmatService;
  let prisma: {
    hazardousMaterial: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock };
    safetyDataSheet: { create: jest.Mock; findMany: jest.Mock };
    projectHazmatInventory: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; delete: jest.Mock };
    project: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      hazardousMaterial: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
      safetyDataSheet: { create: jest.fn(), findMany: jest.fn() },
      projectHazmatInventory: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
      project: { findFirst: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        HazmatService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(HazmatService);
  });

  describe("staleSdsReport()", () => {
    it("flags a material with no SDS on file at all", async () => {
      prisma.hazardousMaterial.findMany.mockResolvedValue([{ id: "m1", name: "Acetone", manufacturer: null, sdsSheets: [] }]);

      const result = await service.staleSdsReport(COMPANY_A);

      expect(result).toHaveLength(1);
      expect(result[0].latestRevisionDate).toBeNull();
    });

    it("flags a material whose latest SDS revision is older than the review cycle", async () => {
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 40);
      prisma.hazardousMaterial.findMany.mockResolvedValue([
        { id: "m1", name: "Acetone", manufacturer: null, sdsSheets: [{ revisionDate: oldDate }] },
      ]);

      const result = await service.staleSdsReport(COMPANY_A, 36);

      expect(result).toHaveLength(1);
    });

    it("excludes a material whose latest SDS is within the review cycle", async () => {
      const recentDate = new Date();
      recentDate.setMonth(recentDate.getMonth() - 6);
      prisma.hazardousMaterial.findMany.mockResolvedValue([
        { id: "m1", name: "Acetone", manufacturer: null, sdsSheets: [{ revisionDate: recentDate }] },
      ]);

      const result = await service.staleSdsReport(COMPANY_A, 36);

      expect(result).toHaveLength(0);
    });
  });

  describe("addToProjectInventory()", () => {
    it("rejects a project that doesn't belong to the company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.addToProjectInventory(COMPANY_A, { name: "Owner" }, "proj-1", { hazardousMaterialId: "m1" }),
      ).rejects.toThrow();
    });

    it("adds an inventory item once the project and material are both found", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "proj-1", name: "Site A" });
      prisma.hazardousMaterial.findFirst.mockResolvedValue({ id: "m1", name: "Acetone" });
      prisma.projectHazmatInventory.create.mockResolvedValue({ id: "inv-1" });

      const result = await service.addToProjectInventory(COMPANY_A, { name: "Owner" }, "proj-1", {
        hazardousMaterialId: "m1",
        quantity: "2 x 5-gallon drums",
      });

      expect(result.id).toBe("inv-1");
    });
  });
});
