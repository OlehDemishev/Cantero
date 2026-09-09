import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SupplierPortalService } from "./supplier-portal.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { OutboxService } from "../common/webhooks/outbox.service";

const SUPPLIER_A = { supplierId: "supplier-a", companyId: "company-a" };

describe("SupplierPortalService", () => {
  let service: SupplierPortalService;
  let prisma: {
    purchaseOrder: { findFirst: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let outbox: { enqueue: jest.Mock };

  beforeEach(async () => {
    prisma = {
      purchaseOrder: { findFirst: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    outbox = { enqueue: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SupplierPortalService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutboxService, useValue: outbox },
      ],
    }).compile();

    service = module.get(SupplierPortalService);
  });

  describe("acknowledge()", () => {
    it("rejects an order that doesn't belong to this supplier", async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(null);

      await expect(service.acknowledge(SUPPLIER_A, "po-1", {})).rejects.toThrow(NotFoundException);
      expect(prisma.purchaseOrder.update).not.toHaveBeenCalled();
    });

    it("rejects acknowledging a draft order that hasn't been placed yet", async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue({ id: "po-1", status: "draft", acknowledgedAt: null });

      await expect(service.acknowledge(SUPPLIER_A, "po-1", {})).rejects.toThrow(BadRequestException);
      expect(prisma.purchaseOrder.update).not.toHaveBeenCalled();
    });

    it("rejects re-acknowledging an already-acknowledged order", async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue({ id: "po-1", status: "ordered", acknowledgedAt: new Date() });

      await expect(service.acknowledge(SUPPLIER_A, "po-1", {})).rejects.toThrow(BadRequestException);
      expect(prisma.purchaseOrder.update).not.toHaveBeenCalled();
    });

    it("stores the ETA/note and triggers a webhook", async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue({ id: "po-1", status: "ordered", acknowledgedAt: null });
      prisma.purchaseOrder.update.mockResolvedValue({ id: "po-1", acknowledgedAt: new Date() });

      await service.acknowledge(SUPPLIER_A, "po-1", { eta: "2026-10-01T00:00:00.000Z", note: "Shipping Monday" });

      expect(prisma.purchaseOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "po-1" },
          data: expect.objectContaining({ supplierEta: new Date("2026-10-01T00:00:00.000Z"), supplierNote: "Shipping Monday" }),
        }),
      );
      expect(outbox.enqueue).toHaveBeenCalledWith(prisma, "company-a", "purchase_order.acknowledged", { purchaseOrderId: "po-1" });
    });
  });
});
