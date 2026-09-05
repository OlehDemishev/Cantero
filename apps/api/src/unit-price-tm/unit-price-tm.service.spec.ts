import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { UnitPriceTmService } from "./unit-price-tm.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("UnitPriceTmService", () => {
  let service: UnitPriceTmService;
  let prisma: {
    project: { findFirst: jest.Mock };
    unitPriceItem: { findFirst: jest.Mock; create: jest.Mock };
    unitPriceMeasurement: { create: jest.Mock };
    tMTicket: { findFirst: jest.Mock; count: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      unitPriceItem: { findFirst: jest.fn(), create: jest.fn() },
      unitPriceMeasurement: { create: jest.fn() },
      tMTicket: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [UnitPriceTmService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(UnitPriceTmService);
  });

  describe("createUnitPriceItem()", () => {
    it("rejects an item for a project that doesn't belong to the company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(
        service.createUnitPriceItem(COMPANY_A, ACTOR, "project-1", { description: "Curb", unit: "lf", contractUnitPrice: 12 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("addMeasurement()", () => {
    it("throws when the unit-price item doesn't belong to the company", async () => {
      prisma.unitPriceItem.findFirst.mockResolvedValue(null);
      await expect(
        service.addMeasurement(COMPANY_A, ACTOR, "item-1", { measuredQuantity: 10, measuredByName: "Foreman" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("records a measurement against an existing item", async () => {
      prisma.unitPriceItem.findFirst.mockResolvedValue({ id: "item-1", unit: "lf", description: "Curb" });
      prisma.unitPriceMeasurement.create.mockResolvedValue({ id: "meas-1" });

      await service.addMeasurement(COMPANY_A, ACTOR, "item-1", { measuredQuantity: 10, measuredByName: "Foreman" });

      expect(prisma.unitPriceMeasurement.create).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        COMPANY_A,
        ACTOR,
        "unit_price_item.measured",
        "UnitPriceItem",
        "item-1",
        expect.any(String),
      );
    });
  });

  describe("createTMTicket()", () => {
    it("rejects a ticket for a project that doesn't belong to the company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(
        service.createTMTicket(COMPANY_A, ACTOR, "project-1", {
          workDate: new Date().toISOString(),
          description: "Extra excavation",
          laborCost: 100,
          equipmentCost: 0,
          materialCost: 0,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("assigns the next sequential ticket number for the project", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      prisma.tMTicket.count.mockResolvedValue(2);
      prisma.tMTicket.create.mockResolvedValue({ id: "ticket-1", ticketNumber: 3 });

      await service.createTMTicket(COMPANY_A, ACTOR, "project-1", {
        workDate: new Date().toISOString(),
        description: "Extra excavation",
        laborCost: 100,
        equipmentCost: 0,
        materialCost: 0,
      });

      expect(prisma.tMTicket.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ticketNumber: 3 }) }),
      );
    });
  });

  describe("decideTMTicket()", () => {
    it("throws when the ticket doesn't belong to the company", async () => {
      prisma.tMTicket.findFirst.mockResolvedValue(null);
      await expect(service.decideTMTicket(COMPANY_A, ACTOR, "ticket-1", { status: "approved", ownerSignerName: "Owner" })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("rejects deciding a ticket that isn't in draft", async () => {
      prisma.tMTicket.findFirst.mockResolvedValue({ id: "ticket-1", status: "approved", ticketNumber: 1 });
      await expect(service.decideTMTicket(COMPANY_A, ACTOR, "ticket-1", { status: "approved", ownerSignerName: "Owner" })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("approves a draft ticket and records the signer", async () => {
      prisma.tMTicket.findFirst.mockResolvedValue({ id: "ticket-1", status: "draft", ticketNumber: 1 });
      prisma.tMTicket.update.mockResolvedValue({ id: "ticket-1", status: "approved" });

      const result = await service.decideTMTicket(COMPANY_A, ACTOR, "ticket-1", { status: "approved", ownerSignerName: "Owner" });

      expect(result.status).toBe("approved");
      expect(prisma.tMTicket.update).toHaveBeenCalledWith({
        where: { id: "ticket-1" },
        data: { status: "approved", ownerSignerName: "Owner", signedAt: expect.any(Date), disputeReason: null },
      });
    });

    it("disputes a draft ticket with a reason, for later revision", async () => {
      prisma.tMTicket.findFirst.mockResolvedValue({ id: "ticket-1", status: "draft", ticketNumber: 1 });
      prisma.tMTicket.update.mockResolvedValue({ id: "ticket-1", status: "disputed" });

      await service.decideTMTicket(COMPANY_A, ACTOR, "ticket-1", {
        status: "disputed",
        ownerSignerName: "Owner",
        disputeReason: "Labor hours look padded",
      });

      expect(prisma.tMTicket.update).toHaveBeenCalledWith({
        where: { id: "ticket-1" },
        data: { status: "disputed", ownerSignerName: "Owner", signedAt: expect.any(Date), disputeReason: "Labor hours look padded" },
      });
    });
  });

  describe("reviseTMTicket()", () => {
    it("throws when the ticket doesn't belong to the company", async () => {
      prisma.tMTicket.findFirst.mockResolvedValue(null);
      await expect(service.reviseTMTicket(COMPANY_A, ACTOR, "ticket-1", { laborCost: 200 })).rejects.toThrow(NotFoundException);
    });

    it("rejects revising a ticket that isn't disputed", async () => {
      prisma.tMTicket.findFirst.mockResolvedValue({ id: "ticket-1", status: "draft", ticketNumber: 1 });
      await expect(service.reviseTMTicket(COMPANY_A, ACTOR, "ticket-1", { laborCost: 200 })).rejects.toThrow(BadRequestException);
    });

    it("edits the disputed fields, clears the dispute, bumps revisionCount, and returns it to draft", async () => {
      prisma.tMTicket.findFirst.mockResolvedValue({ id: "ticket-1", status: "disputed", ticketNumber: 1 });
      prisma.tMTicket.update.mockResolvedValue({ id: "ticket-1", status: "draft" });

      await service.reviseTMTicket(COMPANY_A, ACTOR, "ticket-1", { laborCost: 80 });

      expect(prisma.tMTicket.update).toHaveBeenCalledWith({
        where: { id: "ticket-1" },
        data: {
          description: undefined,
          laborCost: 80,
          equipmentCost: undefined,
          materialCost: undefined,
          status: "draft",
          disputeReason: null,
          ownerSignerName: null,
          signedAt: null,
          revisionCount: { increment: 1 },
        },
      });
    });
  });
});
