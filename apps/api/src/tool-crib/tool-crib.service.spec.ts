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
    toolCribUnit: { findMany: jest.Mock; findFirst: jest.Mock; createMany: jest.Mock; update: jest.Mock };
    toolCheckout: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    worker: { findFirst: jest.Mock };
    project: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      toolCribItem: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      toolCribUnit: { findMany: jest.fn(), findFirst: jest.fn(), createMany: jest.fn(), update: jest.fn() },
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

  describe("registerUnits()", () => {
    it("rejects registering units on an item that isn't serial-tracked", async () => {
      prisma.toolCribItem.findFirst.mockResolvedValue({ id: "item-1", name: "Hard hats", serialTracked: false });

      await expect(service.registerUnits(COMPANY_A, ACTOR, "item-1", { serialNumbers: ["SN-1"] })).rejects.toThrow(BadRequestException);
    });

    it("creates one ToolCribUnit per serial number and bumps quantityOnHand by the count added", async () => {
      prisma.toolCribItem.findFirst.mockResolvedValue({ id: "item-1", name: "Generator", serialTracked: true });
      prisma.toolCribUnit.findMany.mockResolvedValue([]);
      prisma.$transaction.mockResolvedValue([{ count: 2 }, { id: "item-1" }]);

      await service.registerUnits(COMPANY_A, ACTOR, "item-1", { serialNumbers: ["SN-1", "SN-2"] });

      expect(prisma.toolCribUnit.createMany).toHaveBeenCalledWith({
        data: [
          { companyId: COMPANY_A, toolCribItemId: "item-1", serialNumber: "SN-1" },
          { companyId: COMPANY_A, toolCribItemId: "item-1", serialNumber: "SN-2" },
        ],
      });
      expect(prisma.toolCribItem.update).toHaveBeenCalledWith({ where: { id: "item-1" }, data: { quantityOnHand: { increment: 2 } } });
    });
  });

  describe("checkOut() — serial-tracked items", () => {
    it("requires a unitId for a serial-tracked item", async () => {
      prisma.toolCribItem.findFirst.mockResolvedValue({ id: "item-1", name: "Generator", serialTracked: true });
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", name: "Jane" });

      await expect(service.checkOut(COMPANY_A, ACTOR, "item-1", { workerId: "worker-1" } as any)).rejects.toThrow(BadRequestException);
    });

    it("rejects checking out a unit that isn't available", async () => {
      prisma.toolCribItem.findFirst.mockResolvedValue({ id: "item-1", name: "Generator", serialTracked: true });
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", name: "Jane" });
      prisma.toolCribUnit.findFirst.mockResolvedValue({ id: "unit-1", serialNumber: "SN-1", status: "checked_out" });

      await expect(service.checkOut(COMPANY_A, ACTOR, "item-1", { workerId: "worker-1", unitId: "unit-1" } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("checks out the specific unit: creates a checkout, marks the unit checked_out, decrements quantityOnHand by 1", async () => {
      prisma.toolCribItem.findFirst.mockResolvedValue({ id: "item-1", name: "Generator", serialTracked: true });
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", name: "Jane" });
      prisma.toolCribUnit.findFirst.mockResolvedValue({ id: "unit-1", serialNumber: "SN-1", status: "available" });
      prisma.$transaction.mockResolvedValue([{ id: "checkout-1" }, { id: "unit-1", status: "checked_out" }, { id: "item-1" }]);

      const result = await service.checkOut(COMPANY_A, ACTOR, "item-1", { workerId: "worker-1", unitId: "unit-1" } as any);

      expect(result.id).toBe("checkout-1");
      expect(prisma.toolCheckout.create).toHaveBeenCalledWith({
        data: { companyId: COMPANY_A, itemId: "item-1", toolCribUnitId: "unit-1", workerId: "worker-1", projectId: undefined, quantity: 1, notes: undefined },
      });
    });
  });

  describe("checkIn() — serial-tracked checkouts", () => {
    it("a good return frees the unit and restores quantityOnHand", async () => {
      const checkout = { id: "checkout-1", returnedAt: null, quantity: 1, itemId: "item-1", toolCribUnitId: "unit-1", item: { name: "Generator" }, worker: { name: "Jane" } };
      prisma.toolCheckout.findFirst.mockResolvedValue(checkout);
      const tx = {
        toolCheckout: { update: jest.fn().mockResolvedValue({ id: "checkout-1", returnedAt: new Date() }) },
        toolCribUnit: { update: jest.fn().mockResolvedValue({}) },
        toolCribItem: { update: jest.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      await service.checkIn(COMPANY_A, ACTOR, "checkout-1", { returnCondition: "good" } as any);

      expect(tx.toolCribUnit.update).toHaveBeenCalledWith({ where: { id: "unit-1" }, data: { status: "available" } });
      expect(tx.toolCribItem.update).toHaveBeenCalledWith({ where: { id: "item-1" }, data: { quantityOnHand: { increment: 1 } } });
    });

    it("a lost unit is marked lost and never restores quantityOnHand", async () => {
      const checkout = { id: "checkout-1", returnedAt: null, quantity: 1, itemId: "item-1", toolCribUnitId: "unit-1", item: { name: "Generator" }, worker: { name: "Jane" } };
      prisma.toolCheckout.findFirst.mockResolvedValue(checkout);
      const tx = {
        toolCheckout: { update: jest.fn().mockResolvedValue({ id: "checkout-1", returnedAt: new Date() }) },
        toolCribUnit: { update: jest.fn().mockResolvedValue({}) },
        toolCribItem: { update: jest.fn() },
      };
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      await service.checkIn(COMPANY_A, ACTOR, "checkout-1", { returnCondition: "lost" } as any);

      expect(tx.toolCribUnit.update).toHaveBeenCalledWith({ where: { id: "unit-1" }, data: { status: "lost" } });
      expect(tx.toolCribItem.update).not.toHaveBeenCalled();
    });
  });
});
