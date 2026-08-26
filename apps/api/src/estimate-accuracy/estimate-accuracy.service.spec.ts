import { Test } from "@nestjs/testing";
import { EstimateAccuracyService } from "./estimate-accuracy.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("EstimateAccuracyService.rateItemAccuracy", () => {
  let service: EstimateAccuracyService;
  let prisma: { rateCatalogItem: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { rateCatalogItem: { findMany: jest.fn() } };
    const module = await Test.createTestingModule({
      providers: [EstimateAccuracyService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(EstimateAccuracyService);
  });

  it("flags a rate item that consistently runs over its estimated labor hours", async () => {
    prisma.rateCatalogItem.findMany.mockResolvedValue([
      {
        id: "item-1",
        code: "TILE-01",
        name: "Lay ceramic tile",
        unit: "m2",
        laborHoursPerUnit: 1,
        materials: [],
        estimateLines: [
          { quantity: 10, tasks: [{ timeEntries: [{ hours: 6 }] }], stockMovements: [] },
          { quantity: 10, tasks: [{ timeEntries: [{ hours: 6 }] }], stockMovements: [] },
        ],
      },
    ]);

    const result = await service.rateItemAccuracy(COMPANY_A);

    expect(result[0].laborSampleSize).toBe(2);
    expect(result[0].estimatedLaborHours).toBe(20);
    expect(result[0].actualLaborHours).toBe(12);
    expect(result[0].laborDeviationPercent).toBe(-40);
  });

  it("excludes a line with no recorded actual hours from the labor sample", async () => {
    prisma.rateCatalogItem.findMany.mockResolvedValue([
      {
        id: "item-1",
        code: "TILE-01",
        name: "Lay ceramic tile",
        unit: "m2",
        laborHoursPerUnit: 1,
        materials: [],
        estimateLines: [
          { quantity: 10, tasks: [], stockMovements: [] },
          { quantity: 10, tasks: [{ timeEntries: [{ hours: 10 }] }], stockMovements: [] },
        ],
      },
    ]);

    const result = await service.rateItemAccuracy(COMPANY_A);

    expect(result[0].laborSampleSize).toBe(1);
    // Below MIN_SAMPLE_SIZE (2), so no deviation percent is reported despite the raw numbers matching exactly.
    expect(result[0].laborDeviationPercent).toBeNull();
  });

  it("computes materials cost deviation from actual StockMovement quantities against the norm", async () => {
    prisma.rateCatalogItem.findMany.mockResolvedValue([
      {
        id: "item-1",
        code: "TILE-01",
        name: "Lay ceramic tile",
        unit: "m2",
        laborHoursPerUnit: 1,
        materials: [
          { materialCatalogItemId: "mat-1", quantityPerUnit: 1, wasteFactorPercent: 0, materialCatalogItem: { defaultUnitPrice: 10 } },
        ],
        estimateLines: [
          { quantity: 10, tasks: [], stockMovements: [{ quantity: 12, materialCatalogItemId: "mat-1" }] },
          { quantity: 10, tasks: [], stockMovements: [{ quantity: 12, materialCatalogItemId: "mat-1" }] },
        ],
      },
    ]);

    const result = await service.rateItemAccuracy(COMPANY_A);

    expect(result[0].materialSampleSize).toBe(2);
    expect(result[0].estimatedMaterialsCost).toBe(200);
    expect(result[0].actualMaterialsCost).toBe(240);
    expect(result[0].materialsDeviationPercent).toBe(20);
  });

  it("omits a rate item with no recorded actuals for either labor or materials", async () => {
    prisma.rateCatalogItem.findMany.mockResolvedValue([
      {
        id: "item-1",
        code: "IDLE-01",
        name: "Never used",
        unit: "ea",
        laborHoursPerUnit: 1,
        materials: [],
        estimateLines: [{ quantity: 5, tasks: [], stockMovements: [] }],
      },
    ]);

    const result = await service.rateItemAccuracy(COMPANY_A);

    expect(result).toEqual([]);
  });

  it("scopes estimate lines to this company's approved estimates", async () => {
    prisma.rateCatalogItem.findMany.mockResolvedValue([]);

    await service.rateItemAccuracy(COMPANY_A);

    const call = prisma.rateCatalogItem.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ companyId: COMPANY_A });
    expect(call.include.estimateLines.where).toEqual({ estimate: { companyId: COMPANY_A, status: "approved" } });
  });
});
