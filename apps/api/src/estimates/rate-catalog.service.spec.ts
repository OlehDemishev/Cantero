import { BadRequestException, NotFoundException } from "@nestjs/common";
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
        formulaParams: [],
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
      formulaParams: [],
      materials: [{ materialCatalogItemId: "own-material", quantityPerUnit: 1, wasteFactorPercent: 0 }],
    });

    expect(prisma.rateCatalogItem.create).toHaveBeenCalled();
  });
});

const ACTOR = { userId: "user-1", name: "Estimator" };

describe("RateCatalogService.update", () => {
  let service: RateCatalogService;
  let prisma: {
    rateCatalogItem: { findFirst: jest.Mock; update: jest.Mock };
    rateCatalogItemRevision: { create: jest.Mock };
    rateCatalogItemPendingChange: { create: jest.Mock };
    catalog: { findFirst: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      rateCatalogItem: { findFirst: jest.fn(), update: jest.fn() },
      rateCatalogItemRevision: { create: jest.fn() },
      rateCatalogItemPendingChange: { create: jest.fn() },
      catalog: { findFirst: jest.fn() },
      company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ rateCatalogApprovalThresholdPercent: null }) },
    };
    const module = await Test.createTestingModule({
      providers: [RateCatalogService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: { record: jest.fn() } }],
    }).compile();
    service = module.get(RateCatalogService);
  });

  it("snapshots the prior state into a revision before applying the update", async () => {
    prisma.rateCatalogItem.findFirst.mockResolvedValue({
      id: "item-1",
      code: "TILE-01",
      name: "Lay tile",
      unit: "m2",
      laborHoursPerUnit: 1,
      formula: null,
      formulaParams: [],
    });
    prisma.rateCatalogItem.update.mockResolvedValue({ id: "item-1", name: "Lay ceramic tile" });

    await service.update(COMPANY_A, ACTOR, "item-1", { name: "Lay ceramic tile" });

    expect(prisma.rateCatalogItemRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rateCatalogItemId: "item-1", name: "Lay tile", changedByName: "Estimator" }) }),
    );
    expect(prisma.rateCatalogItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Lay ceramic tile" }) }),
    );
  });

  it("rejects an update whose formula fails to evaluate against its declared params", async () => {
    prisma.rateCatalogItem.findFirst.mockResolvedValue({
      id: "item-1",
      code: "WALL-01",
      name: "Frame wall",
      unit: "m2",
      laborHoursPerUnit: 1,
      formula: null,
      formulaParams: [],
    });

    await expect(
      service.update(COMPANY_A, ACTOR, "item-1", { formula: "length *", formulaParams: ["length"] }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.rateCatalogItem.update).not.toHaveBeenCalled();
  });

  it("rejects assigning a catalog that does not belong to this company", async () => {
    prisma.rateCatalogItem.findFirst.mockResolvedValue({
      id: "item-1",
      code: "WALL-01",
      name: "Frame wall",
      unit: "m2",
      laborHoursPerUnit: 1,
      formula: null,
      formulaParams: [],
    });
    prisma.catalog.findFirst.mockResolvedValue(null);

    await expect(service.update(COMPANY_A, ACTOR, "item-1", { catalogId: "foreign-catalog" })).rejects.toThrow(NotFoundException);
    expect(prisma.rateCatalogItem.update).not.toHaveBeenCalled();
  });

  it("applies immediately when the company has no approval threshold configured, even for a big labor-hours swing", async () => {
    prisma.rateCatalogItem.findFirst.mockResolvedValue({
      id: "item-1", code: "TILE-01", name: "Lay tile", unit: "m2", laborHoursPerUnit: 1, formula: null, formulaParams: [],
    });
    prisma.rateCatalogItem.update.mockResolvedValue({ id: "item-1", laborHoursPerUnit: 5 });

    const result = await service.update(COMPANY_A, ACTOR, "item-1", { laborHoursPerUnit: 5 });

    expect(result.pendingApproval).toBe(false);
    expect(prisma.rateCatalogItem.update).toHaveBeenCalled();
    expect(prisma.rateCatalogItemPendingChange.create).not.toHaveBeenCalled();
  });

  it("holds a labor-hours swing beyond the configured threshold as a pending change instead of applying it", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ rateCatalogApprovalThresholdPercent: "10" });
    prisma.rateCatalogItem.findFirst.mockResolvedValue({
      id: "item-1", code: "TILE-01", name: "Lay tile", unit: "m2", laborHoursPerUnit: 1, formula: null, formulaParams: [],
    });
    prisma.rateCatalogItemPendingChange.create.mockResolvedValue({ id: "pending-1", status: "pending" });

    const result = await service.update(COMPANY_A, ACTOR, "item-1", { laborHoursPerUnit: 5 });

    expect(result.pendingApproval).toBe(true);
    expect(prisma.rateCatalogItem.update).not.toHaveBeenCalled();
    expect(prisma.rateCatalogItemPendingChange.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rateCatalogItemId: "item-1", laborHoursPerUnit: 5, proposedByName: "Estimator" }) }),
    );
  });

  it("applies immediately when the swing is within the configured threshold", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ rateCatalogApprovalThresholdPercent: "10" });
    prisma.rateCatalogItem.findFirst.mockResolvedValue({
      id: "item-1", code: "TILE-01", name: "Lay tile", unit: "m2", laborHoursPerUnit: 1, formula: null, formulaParams: [],
    });
    prisma.rateCatalogItem.update.mockResolvedValue({ id: "item-1", laborHoursPerUnit: 1.05 });

    const result = await service.update(COMPANY_A, ACTOR, "item-1", { laborHoursPerUnit: 1.05 });

    expect(result.pendingApproval).toBe(false);
    expect(prisma.rateCatalogItemPendingChange.create).not.toHaveBeenCalled();
  });
});

describe("RateCatalogService — pending change decisions", () => {
  let service: RateCatalogService;
  let prisma: {
    rateCatalogItem: { findFirst: jest.Mock; update: jest.Mock };
    rateCatalogItemRevision: { create: jest.Mock };
    rateCatalogItemPendingChange: { findFirst: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      rateCatalogItem: { findFirst: jest.fn(), update: jest.fn() },
      rateCatalogItemRevision: { create: jest.fn() },
      rateCatalogItemPendingChange: { findFirst: jest.fn(), update: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [RateCatalogService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: { record: jest.fn() } }],
    }).compile();
    service = module.get(RateCatalogService);
  });

  describe("approvePendingChange()", () => {
    it("throws when the pending change doesn't belong to this company", async () => {
      prisma.rateCatalogItemPendingChange.findFirst.mockResolvedValue(null);
      await expect(service.approvePendingChange(COMPANY_A, ACTOR, "pending-1", {})).rejects.toThrow(NotFoundException);
    });

    it("rejects deciding a change that was already decided", async () => {
      prisma.rateCatalogItemPendingChange.findFirst.mockResolvedValue({ id: "pending-1", status: "approved" });
      await expect(service.approvePendingChange(COMPANY_A, ACTOR, "pending-1", {})).rejects.toThrow(BadRequestException);
    });

    it("applies the proposed laborHoursPerUnit and marks the change approved", async () => {
      prisma.rateCatalogItemPendingChange.findFirst.mockResolvedValue({
        id: "pending-1",
        status: "pending",
        rateCatalogItemId: "item-1",
        name: null,
        unit: null,
        laborHoursPerUnit: "5",
        catalogId: null,
        formula: null,
        formulaParams: [],
      });
      prisma.rateCatalogItem.findFirst.mockResolvedValue({
        id: "item-1", code: "TILE-01", name: "Lay tile", unit: "m2", laborHoursPerUnit: 1, formula: null, formulaParams: [],
      });
      prisma.rateCatalogItem.update.mockResolvedValue({ id: "item-1", laborHoursPerUnit: 5 });

      await service.approvePendingChange(COMPANY_A, ACTOR, "pending-1", { decisionNote: "Confirmed with foreman" });

      expect(prisma.rateCatalogItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ laborHoursPerUnit: 5 }) }));
      expect(prisma.rateCatalogItemPendingChange.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "pending-1" }, data: expect.objectContaining({ status: "approved", decisionNote: "Confirmed with foreman" }) }),
      );
    });
  });

  describe("rejectPendingChange()", () => {
    it("marks the change rejected without touching the rate catalog item", async () => {
      prisma.rateCatalogItemPendingChange.findFirst.mockResolvedValue({ id: "pending-1", status: "pending", rateCatalogItemId: "item-1" });
      prisma.rateCatalogItemPendingChange.update.mockResolvedValue({ id: "pending-1", status: "rejected" });

      await service.rejectPendingChange(COMPANY_A, ACTOR, "pending-1", { decisionNote: "Not justified" });

      expect(prisma.rateCatalogItem.update).not.toHaveBeenCalled();
      expect(prisma.rateCatalogItemPendingChange.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "rejected", decisionNote: "Not justified" }) }),
      );
    });
  });
});

describe("RateCatalogService.evaluateFormula", () => {
  let service: RateCatalogService;
  let prisma: { rateCatalogItem: { findFirst: jest.Mock } };

  beforeEach(async () => {
    prisma = { rateCatalogItem: { findFirst: jest.fn() } };
    const module = await Test.createTestingModule({
      providers: [RateCatalogService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: { record: jest.fn() } }],
    }).compile();
    service = module.get(RateCatalogService);
  });

  it("computes a quantity from the item's formula and supplied variables", async () => {
    prisma.rateCatalogItem.findFirst.mockResolvedValue({
      id: "item-1",
      formula: "length * height",
      formulaParams: ["length", "height"],
    });

    const result = await service.evaluateFormula(COMPANY_A, "item-1", { variables: { length: 3, height: 2 } });

    expect(result).toEqual({ value: 6 });
  });

  it("rejects when a required parameter is missing", async () => {
    prisma.rateCatalogItem.findFirst.mockResolvedValue({ id: "item-1", formula: "length * height", formulaParams: ["length", "height"] });

    await expect(service.evaluateFormula(COMPANY_A, "item-1", { variables: { length: 3 } })).rejects.toThrow(BadRequestException);
  });

  it("rejects when the item has no formula at all", async () => {
    prisma.rateCatalogItem.findFirst.mockResolvedValue({ id: "item-1", formula: null, formulaParams: [] });

    await expect(service.evaluateFormula(COMPANY_A, "item-1", { variables: {} })).rejects.toThrow(BadRequestException);
  });
});
