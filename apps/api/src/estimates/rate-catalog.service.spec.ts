import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { RateCatalogService } from "./rate-catalog.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";

describe("RateCatalogService — cross-tenant isolation", () => {
  let service: RateCatalogService;
  let prisma: {
    rateCatalogItem: { create: jest.Mock };
    materialCatalogItem: { count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      rateCatalogItem: { create: jest.fn() },
      materialCatalogItem: { count: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        RateCatalogService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn(), list: jest.fn() } },
      ],
    }).compile();

    service = module.get(RateCatalogService);
  });

  it("rejects a material that belongs to another company", async () => {
    // Two distinct material IDs referenced, but only 1 actually belongs to this company.
    prisma.materialCatalogItem.count.mockResolvedValue(1);

    await expect(
      service.create(COMPANY_A, {
        code: "TILE-01",
        name: "Lay tile",
        unit: "m2",
        laborHoursPerUnit: 1,
        materials: [
          { materialCatalogItemId: "own-material", quantityPerUnit: 1, wasteFactorPercent: 0 },
          { materialCatalogItemId: "foreign-material", quantityPerUnit: 1, wasteFactorPercent: 0 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.materialCatalogItem.count).toHaveBeenCalledWith({
      where: { id: { in: ["own-material", "foreign-material"] }, companyId: COMPANY_A },
    });
    expect(prisma.rateCatalogItem.create).not.toHaveBeenCalled();
  });

  it("allows creation when every referenced material belongs to this company", async () => {
    prisma.materialCatalogItem.count.mockResolvedValue(1);
    prisma.rateCatalogItem.create.mockResolvedValue({ id: "new-item" });

    await service.create(COMPANY_A, {
      code: "TILE-01",
      name: "Lay tile",
      unit: "m2",
      laborHoursPerUnit: 1,
      materials: [{ materialCatalogItemId: "own-material", quantityPerUnit: 1, wasteFactorPercent: 0 }],
    });

    expect(prisma.rateCatalogItem.create).toHaveBeenCalled();
  });
});
