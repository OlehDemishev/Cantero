import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { MaterialRfqsService } from "./material-rfqs.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("MaterialRfqsService", () => {
  let service: MaterialRfqsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    materialCatalogItem: { findMany: jest.Mock };
    materialRfq: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    materialRfqQuote: { upsert: jest.Mock; updateMany: jest.Mock; update: jest.Mock };
    supplier: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };

  const materialLine = (overrides: Record<string, unknown> = {}) => ({
    id: "line-1",
    rfqId: "rfq-1",
    materialCatalogItemId: "mat-1",
    quantity: "10",
    materialCatalogItem: { id: "mat-1", code: "BRK-100", name: "Red brick", unit: "pc" },
    quotes: [],
    ...overrides,
  });

  const rfqWith = (lines: ReturnType<typeof materialLine>[], overrides: Record<string, unknown> = {}) => ({
    id: "rfq-1",
    companyId: COMPANY_A,
    title: "Q3 concrete",
    status: "open",
    project: null,
    lines,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      materialCatalogItem: { findMany: jest.fn() },
      materialRfq: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      materialRfqQuote: { upsert: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
      supplier: { findFirst: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [MaterialRfqsService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(MaterialRfqsService);
  });

  describe("create", () => {
    it("rejects a material that doesn't belong to this company", async () => {
      prisma.materialCatalogItem.findMany.mockResolvedValue([]);

      await expect(
        service.create(COMPANY_A, ACTOR, { title: "Q3 concrete", lines: [{ materialCatalogItemId: "mat-1", quantity: 10 }] }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.materialRfq.create).not.toHaveBeenCalled();
    });

    it("creates the RFQ with its lines once every material is confirmed", async () => {
      prisma.materialCatalogItem.findMany.mockResolvedValue([{ id: "mat-1" }]);
      prisma.materialRfq.create.mockResolvedValue(rfqWith([materialLine()]));

      const result = await service.create(COMPANY_A, ACTOR, {
        title: "Q3 concrete",
        lines: [{ materialCatalogItemId: "mat-1", quantity: 10 }],
      });

      expect(result.title).toBe("Q3 concrete");
      expect(prisma.materialRfq.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lines: { create: [{ materialCatalogItemId: "mat-1", quantity: 10 }] } }),
        }),
      );
    });
  });

  describe("submitQuote", () => {
    it("rejects a quote on a closed RFQ", async () => {
      prisma.materialRfq.findFirst.mockResolvedValue(rfqWith([materialLine()], { status: "closed" }));

      await expect(
        service.submitQuote(COMPANY_A, "rfq-1", { rfqLineId: "line-1", supplierId: "sup-1", unitPrice: 1.5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects a line that doesn't belong to this RFQ", async () => {
      prisma.materialRfq.findFirst.mockResolvedValue(rfqWith([materialLine()]));

      await expect(
        service.submitQuote(COMPANY_A, "rfq-1", { rfqLineId: "other-line", supplierId: "sup-1", unitPrice: 1.5 }),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects a supplier that doesn't belong to this company", async () => {
      prisma.materialRfq.findFirst.mockResolvedValue(rfqWith([materialLine()]));
      prisma.supplier.findFirst.mockResolvedValue(null);

      await expect(
        service.submitQuote(COMPANY_A, "rfq-1", { rfqLineId: "line-1", supplierId: "sup-1", unitPrice: 1.5 }),
      ).rejects.toThrow(NotFoundException);
    });

    it("upserts the quote by (line, supplier) so a resubmission updates the price", async () => {
      prisma.materialRfq.findFirst.mockResolvedValue(rfqWith([materialLine()]));
      prisma.supplier.findFirst.mockResolvedValue({ id: "sup-1", companyId: COMPANY_A });

      await service.submitQuote(COMPANY_A, "rfq-1", { rfqLineId: "line-1", supplierId: "sup-1", unitPrice: 1.5 });

      expect(prisma.materialRfqQuote.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { rfqLineId_supplierId: { rfqLineId: "line-1", supplierId: "sup-1" } } }),
      );
    });
  });

  describe("awardLine", () => {
    it("throws when the quote isn't on this RFQ", async () => {
      prisma.materialRfq.findFirst.mockResolvedValue(rfqWith([materialLine()]));

      await expect(service.awardLine(COMPANY_A, ACTOR, "rfq-1", "nonexistent-quote")).rejects.toThrow(NotFoundException);
    });

    it("unsets every other quote on the same line before awarding this one, in a transaction", async () => {
      const line = materialLine({
        quotes: [
          { id: "quote-1", unitPrice: "1.20", supplier: { id: "sup-1", name: "Acme Supply" } },
          { id: "quote-2", unitPrice: "1.50", supplier: { id: "sup-2", name: "Beta Materials" } },
        ],
      });
      prisma.materialRfq.findFirst.mockResolvedValue(rfqWith([line]));

      await service.awardLine(COMPANY_A, ACTOR, "rfq-1", "quote-1");

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.materialRfqQuote.updateMany).toHaveBeenCalledWith({ where: { rfqLineId: "line-1" }, data: { isAwarded: false } });
      expect(prisma.materialRfqQuote.update).toHaveBeenCalledWith({ where: { id: "quote-1" }, data: { isAwarded: true } });
    });
  });

  describe("close", () => {
    it("rejects closing an already-closed RFQ", async () => {
      prisma.materialRfq.findFirst.mockResolvedValue(rfqWith([materialLine()], { status: "closed" }));

      await expect(service.close(COMPANY_A, ACTOR, "rfq-1")).rejects.toThrow(BadRequestException);
    });

    it("closes an open RFQ", async () => {
      prisma.materialRfq.findFirst.mockResolvedValue(rfqWith([materialLine()]));

      await service.close(COMPANY_A, ACTOR, "rfq-1");

      expect(prisma.materialRfq.update).toHaveBeenCalledWith({ where: { id: "rfq-1" }, data: { status: "closed" } });
    });
  });
});
