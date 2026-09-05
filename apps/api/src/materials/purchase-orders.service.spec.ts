import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { StockService } from "./stock.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Owner" };

describe("PurchaseOrdersService", () => {
  let service: PurchaseOrdersService;
  let prisma: {
    purchaseOrder: { findFirst: jest.Mock; update: jest.Mock };
    purchaseOrderLine: { findMany: jest.Mock; update: jest.Mock };
    receivingDiscrepancy: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; findMany: jest.Mock };
  };
  let stockService: { recordMovement: jest.Mock };

  beforeEach(async () => {
    prisma = {
      purchaseOrder: { findFirst: jest.fn(), update: jest.fn() },
      purchaseOrderLine: { findMany: jest.fn(), update: jest.fn() },
      receivingDiscrepancy: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    };
    stockService = { recordMovement: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: StockService, useValue: stockService },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(PurchaseOrdersService);
  });

  const poWithLine = (overrides: Partial<{ status: string; quantity: number; quantityReceived: number }> = {}) => ({
    id: "po-1",
    status: overrides.status ?? "ordered",
    lines: [
      {
        id: "line-1",
        materialCatalogItemId: "mat-1",
        quantity: overrides.quantity ?? 10,
        quantityReceived: overrides.quantityReceived ?? 0,
      },
    ],
  });

  describe("receiveShipment()", () => {
    it("rejects receiving against an already fully-received purchase order", async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(poWithLine({ status: "received" }));

      await expect(
        service.receiveShipment(COMPANY_A, ACTOR, "po-1", { warehouseId: "wh-1", lines: [{ lineId: "line-1", quantityReceived: 5 }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects a line that doesn't belong to the purchase order", async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(poWithLine());

      await expect(
        service.receiveShipment(COMPANY_A, ACTOR, "po-1", { warehouseId: "wh-1", lines: [{ lineId: "not-a-line", quantityReceived: 5 }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects damaged quantity greater than received quantity", async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(poWithLine());

      await expect(
        service.receiveShipment(COMPANY_A, ACTOR, "po-1", {
          warehouseId: "wh-1",
          lines: [{ lineId: "line-1", quantityReceived: 3, quantityDamaged: 5 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("records a stock receipt for only the good quantity, marks the PO partially received, and flags no discrepancy for an on-target partial receipt", async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(poWithLine({ quantity: 10 }));
      prisma.purchaseOrderLine.findMany.mockResolvedValue([{ id: "line-1", quantity: 10, quantityReceived: 6 }]);
      prisma.purchaseOrder.update.mockResolvedValue({ id: "po-1", status: "partially_received" });

      const result = await service.receiveShipment(COMPANY_A, ACTOR, "po-1", {
        warehouseId: "wh-1",
        lines: [{ lineId: "line-1", quantityReceived: 6 }],
      });

      expect(stockService.recordMovement).toHaveBeenCalledWith(COMPANY_A, {
        warehouseId: "wh-1",
        materialCatalogItemId: "mat-1",
        type: "receipt",
        quantity: 6,
      });
      expect(prisma.receivingDiscrepancy.create).not.toHaveBeenCalled();
      expect(result.status).toBe("partially_received");
    });

    it("flags an over-ship discrepancy and still receives the good stock", async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(poWithLine({ quantity: 10 }));
      prisma.receivingDiscrepancy.create.mockResolvedValue({ id: "disc-1" });
      prisma.purchaseOrderLine.findMany.mockResolvedValue([{ id: "line-1", quantity: 10, quantityReceived: 12 }]);
      prisma.purchaseOrder.update.mockResolvedValue({ id: "po-1", status: "received" });

      await service.receiveShipment(COMPANY_A, ACTOR, "po-1", {
        warehouseId: "wh-1",
        lines: [{ lineId: "line-1", quantityReceived: 12 }],
      });

      expect(prisma.receivingDiscrepancy.create).toHaveBeenCalledWith({
        data: { companyId: COMPANY_A, purchaseOrderId: "po-1", purchaseOrderLineId: "line-1", type: "over_ship", quantity: 2 },
      });
    });

    it("marks the purchase order fully received and stamps receivedAt once every line is complete", async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(poWithLine({ quantity: 10, quantityReceived: 4 }));
      prisma.purchaseOrderLine.findMany.mockResolvedValue([{ id: "line-1", quantity: 10, quantityReceived: 10 }]);
      prisma.purchaseOrder.update.mockResolvedValue({ id: "po-1", status: "received" });

      await service.receiveShipment(COMPANY_A, ACTOR, "po-1", {
        warehouseId: "wh-1",
        lines: [{ lineId: "line-1", quantityReceived: 6 }],
      });

      const updateCall = prisma.purchaseOrder.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe("received");
      expect(updateCall.data.receivedAt).toBeInstanceOf(Date);
    });
  });

  describe("resolveDiscrepancy()", () => {
    it("throws when the discrepancy doesn't exist", async () => {
      prisma.receivingDiscrepancy.findFirst.mockResolvedValue(null);

      await expect(service.resolveDiscrepancy(COMPANY_A, ACTOR, "disc-1", { resolution: "credit_issued" })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("updates the resolution and notes", async () => {
      prisma.receivingDiscrepancy.findFirst.mockResolvedValue({ id: "disc-1", resolution: "pending" });
      prisma.receivingDiscrepancy.update.mockResolvedValue({ id: "disc-1", resolution: "credit_issued" });

      const result = await service.resolveDiscrepancy(COMPANY_A, ACTOR, "disc-1", { resolution: "credit_issued", resolutionNotes: "Refunded" });

      expect(result.resolution).toBe("credit_issued");
      expect(prisma.receivingDiscrepancy.update).toHaveBeenCalledWith({
        where: { id: "disc-1" },
        data: { resolution: "credit_issued", resolutionNotes: "Refunded" },
      });
    });
  });
});
