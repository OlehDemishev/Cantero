import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ToolCribService } from "./tool-crib.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Owner" };

describe("ToolCribService", () => {
  let service: ToolCribService;
  let prisma: {
    toolCribItem: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    toolCheckout: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    worker: { findFirst: jest.Mock };
    project: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      toolCribItem: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      toolCheckout: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      worker: { findFirst: jest.fn() },
      project: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ToolCribService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(ToolCribService);
  });

  describe("lowParLevelItems()", () => {
    it("filters out items with a null par level and items at or above par", async () => {
      prisma.toolCribItem.findMany.mockResolvedValue([
        { id: "1", parLevel: 5, quantityOnHand: 2 },
        { id: "2", parLevel: 5, quantityOnHand: 5 },
        { id: "3", parLevel: null, quantityOnHand: 0 },
      ]);

      const result = await service.lowParLevelItems(COMPANY_A);

      expect(result.map((i) => i.id)).toEqual(["1"]);
    });
  });

  describe("checkOut()", () => {
    it("rejects checking out more than what's on hand", async () => {
      prisma.toolCribItem.findFirst.mockResolvedValue({ id: "item-1", name: "Drill", quantityOnHand: 2 });
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", name: "Jane" });

      await expect(service.checkOut(COMPANY_A, ACTOR, "item-1", { workerId: "worker-1", quantity: 5 } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws when the worker doesn't belong to the company", async () => {
      prisma.toolCribItem.findFirst.mockResolvedValue({ id: "item-1", name: "Drill", quantityOnHand: 5 });
      prisma.worker.findFirst.mockResolvedValue(null);

      await expect(service.checkOut(COMPANY_A, ACTOR, "item-1", { workerId: "worker-1" } as any)).rejects.toThrow(NotFoundException);
    });

    it("creates a checkout and decrements on-hand quantity via a transaction", async () => {
      prisma.toolCribItem.findFirst.mockResolvedValue({ id: "item-1", name: "Drill", quantityOnHand: 5 });
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", name: "Jane" });
      prisma.$transaction.mockResolvedValue([{ id: "checkout-1" }, { id: "item-1", quantityOnHand: 4 }]);

      const result = await service.checkOut(COMPANY_A, ACTOR, "item-1", { workerId: "worker-1", quantity: 1 } as any);

      expect(result.id).toBe("checkout-1");
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe("checkIn()", () => {
    it("throws when the checkout doesn't exist", async () => {
      prisma.toolCheckout.findFirst.mockResolvedValue(null);

      await expect(service.checkIn(COMPANY_A, ACTOR, "checkout-1", { returnCondition: "good" } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("rejects checking in an already-returned checkout", async () => {
      prisma.toolCheckout.findFirst.mockResolvedValue({ id: "checkout-1", returnedAt: new Date(), item: {}, worker: {} });

      await expect(service.checkIn(COMPANY_A, ACTOR, "checkout-1", { returnCondition: "good" } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("increments on-hand quantity for a good return", async () => {
      const checkout = { id: "checkout-1", returnedAt: null, quantity: 2, itemId: "item-1", item: { name: "Drill" }, worker: { name: "Jane" } };
      prisma.toolCheckout.findFirst.mockResolvedValue(checkout);
      const tx = {
        toolCheckout: { update: jest.fn().mockResolvedValue({ id: "checkout-1", returnedAt: new Date() }) },
        toolCribItem: { update: jest.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      await service.checkIn(COMPANY_A, ACTOR, "checkout-1", { returnCondition: "good" } as any);

      expect(tx.toolCribItem.update).toHaveBeenCalledWith({ where: { id: "item-1" }, data: { quantityOnHand: { increment: 2 } } });
    });

    it("does not restock on-hand quantity for a lost tool", async () => {
      const checkout = { id: "checkout-1", returnedAt: null, quantity: 1, itemId: "item-1", item: { name: "Drill" }, worker: { name: "Jane" } };
      prisma.toolCheckout.findFirst.mockResolvedValue(checkout);
      const tx = {
        toolCheckout: { update: jest.fn().mockResolvedValue({ id: "checkout-1", returnedAt: new Date() }) },
        toolCribItem: { update: jest.fn() },
      };
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      await service.checkIn(COMPANY_A, ACTOR, "checkout-1", { returnCondition: "lost" } as any);

      expect(tx.toolCribItem.update).not.toHaveBeenCalled();
    });
  });

  describe("workerLiability()", () => {
    it("sums chargeAmount across a worker's charged checkouts", async () => {
      prisma.toolCheckout.findMany.mockResolvedValue([
        { chargeAmount: 25.5, item: { name: "Drill" } },
        { chargeAmount: 14.25, item: { name: "Saw" } },
      ]);

      const result = await service.workerLiability(COMPANY_A, "worker-1");

      expect(result.totalCharged).toBe(39.75);
      expect(result.checkouts).toHaveLength(2);
    });
  });
});
