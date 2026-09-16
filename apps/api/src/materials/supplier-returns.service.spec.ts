import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SupplierReturnsService } from "./supplier-returns.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { StockService } from "./stock.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Owner" };

describe("SupplierReturnsService.create", () => {
  let service: SupplierReturnsService;
  let prisma: {
    supplier: { findFirst: jest.Mock };
    purchaseOrder: { findFirst: jest.Mock };
    warehouse: { findFirst: jest.Mock };
    materialCatalogItem: { count: jest.Mock };
    supplierReturn: { create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      supplier: { findFirst: jest.fn().mockResolvedValue({ id: "sup-1", name: "Acme" }) },
      purchaseOrder: { findFirst: jest.fn().mockResolvedValue({ id: "po-1", supplierId: "sup-1" }) },
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: "wh-1" }) },
      materialCatalogItem: { count: jest.fn().mockResolvedValue(1) },
      supplierReturn: { create: jest.fn((args) => args) },
    };
    const module = await Test.createTestingModule({
      providers: [
        SupplierReturnsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StockService, useValue: {} },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = module.get(SupplierReturnsService);
  });

  const INPUT = {
    supplierId: "sup-1",
    purchaseOrderId: "po-1",
    warehouseId: "wh-1",
    reason: "defective" as const,
    lines: [{ materialCatalogItemId: "mat-1", quantity: 5 }],
  };

  it("throws when the supplier doesn't belong to the company", async () => {
    prisma.supplier.findFirst.mockResolvedValue(null);
    await expect(service.create(COMPANY_A, ACTOR, INPUT)).rejects.toThrow(NotFoundException);
  });

  it("throws when the purchase order doesn't belong to the company", async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue(null);
    await expect(service.create(COMPANY_A, ACTOR, INPUT)).rejects.toThrow(NotFoundException);
  });

  it("rejects a purchase order that belongs to a different supplier", async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue({ id: "po-1", supplierId: "sup-2" });
    await expect(service.create(COMPANY_A, ACTOR, INPUT)).rejects.toThrow(BadRequestException);
  });

  it("rejects a material that doesn't belong to the company", async () => {
    prisma.materialCatalogItem.count.mockResolvedValue(0);
    await expect(service.create(COMPANY_A, ACTOR, INPUT)).rejects.toThrow(BadRequestException);
  });

  it("creates a draft return with its lines", async () => {
    await service.create(COMPANY_A, ACTOR, INPUT);
    expect(prisma.supplierReturn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: COMPANY_A,
          supplierId: "sup-1",
          purchaseOrderId: "po-1",
          warehouseId: "wh-1",
          reason: "defective",
          createdByName: "Owner",
          lines: { create: [{ materialCatalogItemId: "mat-1", quantity: 5 }] },
        }),
      }),
    );
  });
});

describe("SupplierReturnsService.send", () => {
  let service: SupplierReturnsService;
  let prisma: {
    supplierReturn: { findFirst: jest.Mock; update: jest.Mock };
    supplierReturnLine: { update: jest.Mock };
    stockMovement: { create: jest.Mock };
    stockLevel: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let stockService: { computeSingleWarehouseCosting: jest.Mock };

  beforeEach(async () => {
    prisma = {
      supplierReturn: {
        findFirst: jest.fn().mockResolvedValue({
          id: "ret-1",
          status: "draft",
          warehouseId: "wh-1",
          lines: [{ id: "line-1", materialCatalogItemId: "mat-1", quantity: 5 }],
        }),
        update: jest.fn().mockResolvedValue({ id: "ret-1", status: "sent", supplier: { name: "Acme" } }),
      },
      supplierReturnLine: { update: jest.fn() },
      stockMovement: { create: jest.fn().mockResolvedValue({ id: "mvmt-1" }) },
      stockLevel: { upsert: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    stockService = { computeSingleWarehouseCosting: jest.fn().mockResolvedValue({ movementUnitCost: null, averageCostUpdate: null }) };

    const module = await Test.createTestingModule({
      providers: [
        SupplierReturnsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StockService, useValue: stockService },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = module.get(SupplierReturnsService);
  });

  it("throws when the return doesn't belong to the company", async () => {
    prisma.supplierReturn.findFirst.mockResolvedValue(null);
    await expect(service.send(COMPANY_A, ACTOR, "ret-1")).rejects.toThrow(NotFoundException);
  });

  it("rejects sending a return that isn't in draft", async () => {
    prisma.supplierReturn.findFirst.mockResolvedValue({ id: "ret-1", status: "sent", lines: [] });
    await expect(service.send(COMPANY_A, ACTOR, "ret-1")).rejects.toThrow(BadRequestException);
  });

  it("creates exactly one write_off movement per line and links it to the line", async () => {
    await service.send(COMPANY_A, ACTOR, "ret-1");

    expect(prisma.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(prisma.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ warehouseId: "wh-1", materialCatalogItemId: "mat-1", type: "write_off", quantity: 5 }) }),
    );
    expect(prisma.supplierReturnLine.update).toHaveBeenCalledWith({ where: { id: "line-1" }, data: { stockMovementId: "mvmt-1" } });
    expect(prisma.supplierReturn.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ret-1" }, data: expect.objectContaining({ status: "sent" }) }),
    );
  });

  it("debits the warehouse's stock level", async () => {
    await service.send(COMPANY_A, ACTOR, "ret-1");
    expect(prisma.stockLevel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { quantityOnHand: { decrement: 5 } } }),
    );
  });
});

describe("SupplierReturnsService.confirm", () => {
  let service: SupplierReturnsService;
  let prisma: { supplierReturn: { findFirst: jest.Mock; update: jest.Mock } };

  beforeEach(async () => {
    prisma = { supplierReturn: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({ id: "ret-1", supplier: { name: "Acme" } }) } };
    const module = await Test.createTestingModule({
      providers: [
        SupplierReturnsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StockService, useValue: {} },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = module.get(SupplierReturnsService);
  });

  it("throws when the return doesn't belong to the company", async () => {
    prisma.supplierReturn.findFirst.mockResolvedValue(null);
    await expect(service.confirm(COMPANY_A, ACTOR, "ret-1")).rejects.toThrow(NotFoundException);
  });

  it("rejects confirming a return that hasn't been sent", async () => {
    prisma.supplierReturn.findFirst.mockResolvedValue({ id: "ret-1", status: "draft" });
    await expect(service.confirm(COMPANY_A, ACTOR, "ret-1")).rejects.toThrow(BadRequestException);
  });

  it("confirms a sent return", async () => {
    prisma.supplierReturn.findFirst.mockResolvedValue({ id: "ret-1", status: "sent" });
    await service.confirm(COMPANY_A, ACTOR, "ret-1");
    expect(prisma.supplierReturn.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ret-1" }, data: expect.objectContaining({ status: "confirmed" }) }),
    );
  });
});
