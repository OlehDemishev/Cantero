import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { LongLeadItemsService } from "./long-lead-items.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Owner" };

describe("LongLeadItemsService", () => {
  let service: LongLeadItemsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    supplier: { findFirst: jest.Mock };
    purchaseOrder: { findFirst: jest.Mock };
    longLeadItem: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: "proj-1", name: "Tower A" }) },
      supplier: { findFirst: jest.fn() },
      purchaseOrder: { findFirst: jest.fn() },
      longLeadItem: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [LongLeadItemsService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: { record: jest.fn() } }],
    }).compile();

    service = module.get(LongLeadItemsService);
  });

  describe("listForProject", () => {
    it("annotates each item with its computed risk", async () => {
      prisma.longLeadItem.findMany.mockResolvedValue([
        {
          id: "item-1",
          description: "Elevator",
          status: "tracking",
          expectedDeliveryDate: new Date("2026-06-01"),
          actualDeliveryDate: null,
          requiredOnSiteDate: new Date("2026-05-01"),
          supplier: null,
          purchaseOrder: null,
        },
      ]);
      const [result] = await service.listForProject(COMPANY_A, "proj-1");
      expect(result.risk).toBe("critical");
      expect(result.slackDays).toBe(-31);
    });

    it("throws when the project doesn't belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.listForProject(COMPANY_A, "proj-x")).rejects.toThrow(NotFoundException);
    });
  });

  describe("create", () => {
    it("creates a tracked item scoped to the project", async () => {
      prisma.longLeadItem.create.mockResolvedValue({ id: "item-1", description: "Switchgear" });
      const result = await service.create(COMPANY_A, ACTOR, { projectId: "proj-1", description: "Switchgear" });
      expect(result.id).toBe("item-1");
      expect(prisma.longLeadItem.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ companyId: COMPANY_A, projectId: "proj-1", description: "Switchgear" }) }),
      );
    });

    it("rejects a supplier that doesn't belong to this company", async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);
      await expect(service.create(COMPANY_A, ACTOR, { projectId: "proj-1", description: "Switchgear", supplierId: "sup-x" })).rejects.toThrow(NotFoundException);
    });
  });

  describe("update", () => {
    it("updates status and clears a date field when explicitly set to null", async () => {
      prisma.longLeadItem.findFirst.mockResolvedValue({ id: "item-1", description: "Elevator" });
      prisma.longLeadItem.update.mockResolvedValue({ id: "item-1", status: "shipped" });
      await service.update(COMPANY_A, ACTOR, "item-1", { status: "shipped", actualDeliveryDate: null });
      expect(prisma.longLeadItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "shipped", actualDeliveryDate: null }) }),
      );
    });

    it("leaves a date field untouched when omitted from the input", async () => {
      prisma.longLeadItem.findFirst.mockResolvedValue({ id: "item-1", description: "Elevator" });
      prisma.longLeadItem.update.mockResolvedValue({ id: "item-1" });
      await service.update(COMPANY_A, ACTOR, "item-1", { status: "ordered" });
      expect(prisma.longLeadItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actualDeliveryDate: undefined }) }));
    });
  });
});
