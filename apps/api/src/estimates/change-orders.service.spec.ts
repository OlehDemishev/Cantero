import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { ChangeOrdersService } from "./change-orders.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";

const COMPANY_A = "company-a";

describe("ChangeOrdersService", () => {
  let service: ChangeOrdersService;
  let prisma: {
    estimate: { findFirst: jest.Mock; findUniqueOrThrow: jest.Mock };
    changeOrder: { count: jest.Mock; create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    changeOrderLine: { create: jest.Mock; update: jest.Mock };
    changeOrderApproval: { findUnique: jest.Mock; create: jest.Mock; count: jest.Mock };
    rateCatalogItem: { findFirst: jest.Mock; findMany: jest.Mock };
    materialCatalogItem: { findMany: jest.Mock };
    markupRule: { findMany: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      estimate: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
      changeOrder: { count: jest.fn(), create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      changeOrderLine: { create: jest.fn(), update: jest.fn() },
      changeOrderApproval: { findUnique: jest.fn(), create: jest.fn(), count: jest.fn() },
      rateCatalogItem: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      materialCatalogItem: { findMany: jest.fn().mockResolvedValue([]) },
      markupRule: { findMany: jest.fn().mockResolvedValue([]) },
      company: { findUniqueOrThrow: jest.fn() },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };

    const module = await Test.createTestingModule({
      providers: [
        ChangeOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: { render: jest.fn() } },
        { provide: StorageService, useValue: { save: jest.fn(), read: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn(), list: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn(), getOrThrow: jest.fn() } },
        { provide: MailService, useValue: { send: jest.fn() } },
        { provide: WebhooksService, useValue: { trigger: jest.fn() } },
      ],
    }).compile();

    service = module.get(ChangeOrdersService);
  });

  describe("create()", () => {
    it("rejects when the estimate is not found for this company", async () => {
      prisma.estimate.findFirst.mockResolvedValue(null);

      await expect(service.create(COMPANY_A, { name: "Owner" }, "estimate-1", { title: "Extra work" })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.changeOrder.create).not.toHaveBeenCalled();
    });

    it("rejects when the estimate is still a draft", async () => {
      prisma.estimate.findFirst.mockResolvedValue({ id: "estimate-1", companyId: COMPANY_A, status: "draft", name: "Test" });

      await expect(service.create(COMPANY_A, { name: "Owner" }, "estimate-1", { title: "Extra work" })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.changeOrder.create).not.toHaveBeenCalled();
    });

    it("numbers a new change order after the existing count for that estimate", async () => {
      prisma.estimate.findFirst.mockResolvedValue({ id: "estimate-1", companyId: COMPANY_A, status: "approved", name: "Test" });
      prisma.changeOrder.count.mockResolvedValue(2);
      prisma.changeOrder.create.mockResolvedValue({ id: "co-3", number: 3, lines: [] });

      await service.create(COMPANY_A, { name: "Owner" }, "estimate-1", { title: "Extra work" });

      expect(prisma.changeOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ number: 3 }) }),
      );
    });
  });

  describe("addLine()", () => {
    it("rejects a rateCatalogItemId that belongs to another company", async () => {
      prisma.changeOrder.findFirst.mockResolvedValue({ id: "co-1", companyId: COMPANY_A, status: "draft", lines: [] });
      prisma.rateCatalogItem.findFirst.mockResolvedValue(null);

      await expect(
        service.addLine(COMPANY_A, "co-1", { rateCatalogItemId: "foreign-rate-item", quantity: 5 }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.rateCatalogItem.findFirst).toHaveBeenCalledWith({
        where: { id: "foreign-rate-item", companyId: COMPANY_A },
      });
      expect(prisma.changeOrderLine.create).not.toHaveBeenCalled();
    });

    it("rejects adding a line once the change order is no longer a draft", async () => {
      prisma.changeOrder.findFirst.mockResolvedValue({ id: "co-1", companyId: COMPANY_A, status: "approved", lines: [] });

      await expect(
        service.addLine(COMPANY_A, "co-1", { rateCatalogItemId: "rate-1", quantity: 5 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.changeOrderLine.create).not.toHaveBeenCalled();
    });
  });

  describe("approve()", () => {
    it("rejects a change order with no lines", async () => {
      prisma.changeOrder.findFirst.mockResolvedValue({
        id: "co-1",
        companyId: COMPANY_A,
        status: "draft",
        number: 1,
        title: "Extra work",
        lines: [],
      });

      await expect(service.approve(COMPANY_A, { name: "Owner" }, "co-1")).rejects.toThrow(BadRequestException);
      expect(prisma.changeOrder.update).not.toHaveBeenCalled();
    });

    it("rejects approving a change order that isn't a draft", async () => {
      prisma.changeOrder.findFirst.mockResolvedValue({
        id: "co-1",
        companyId: COMPANY_A,
        status: "approved",
        number: 1,
        title: "Extra work",
        lines: [{ id: "line-1" }],
      });

      await expect(service.approve(COMPANY_A, { name: "Owner" }, "co-1")).rejects.toThrow(BadRequestException);
      expect(prisma.changeOrder.update).not.toHaveBeenCalled();
    });

    it("finalizes immediately when the company has no approval threshold set", async () => {
      prisma.changeOrder.findFirst.mockResolvedValue({
        id: "co-1",
        companyId: COMPANY_A,
        status: "draft",
        number: 1,
        title: "Extra work",
        grandTotal: 5000,
        lines: [{ id: "line-1" }],
        approvals: [],
      });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ changeOrderApprovalThresholdAmount: null, changeOrderRequiredApprovalCount: 1 });

      await service.approve(COMPANY_A, { userId: "u1", name: "Owner" }, "co-1");

      expect(prisma.changeOrder.update).toHaveBeenCalledWith({ where: { id: "co-1" }, data: { status: "approved" } });
      expect(prisma.changeOrderApproval.create).not.toHaveBeenCalled();
    });

    it("finalizes immediately when the total is under threshold", async () => {
      prisma.changeOrder.findFirst.mockResolvedValue({
        id: "co-1",
        companyId: COMPANY_A,
        status: "draft",
        number: 1,
        title: "Extra work",
        grandTotal: 500,
        lines: [{ id: "line-1" }],
        approvals: [],
      });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ changeOrderApprovalThresholdAmount: 1000, changeOrderRequiredApprovalCount: 2 });

      await service.approve(COMPANY_A, { userId: "u1", name: "Owner" }, "co-1");

      expect(prisma.changeOrder.update).toHaveBeenCalledWith({ where: { id: "co-1" }, data: { status: "approved" } });
    });

    it("records an approval step without finalizing when the required count isn't yet met", async () => {
      prisma.changeOrder.findFirst.mockResolvedValue({
        id: "co-1",
        companyId: COMPANY_A,
        status: "draft",
        number: 1,
        title: "Extra work",
        grandTotal: 5000,
        lines: [{ id: "line-1" }],
        approvals: [],
      });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ changeOrderApprovalThresholdAmount: 1000, changeOrderRequiredApprovalCount: 2 });
      prisma.changeOrderApproval.findUnique.mockResolvedValue(null);
      prisma.changeOrderApproval.count.mockResolvedValue(1);

      await service.approve(COMPANY_A, { userId: "u1", name: "Approver One" }, "co-1");

      expect(prisma.changeOrderApproval.create).toHaveBeenCalledWith({
        data: { changeOrderId: "co-1", userId: "u1", actorName: "Approver One" },
      });
      expect(prisma.changeOrder.update).toHaveBeenCalledWith({ where: { id: "co-1" }, data: { status: "pending_approval" } });
    });

    it("finalizes once the second approver's step reaches the required count", async () => {
      prisma.changeOrder.findFirst.mockResolvedValue({
        id: "co-1",
        companyId: COMPANY_A,
        status: "pending_approval",
        number: 1,
        title: "Extra work",
        grandTotal: 5000,
        lines: [{ id: "line-1" }],
        approvals: [{ userId: "u1" }],
      });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ changeOrderApprovalThresholdAmount: 1000, changeOrderRequiredApprovalCount: 2 });
      prisma.changeOrderApproval.findUnique.mockResolvedValue(null);
      prisma.changeOrderApproval.count.mockResolvedValue(2);

      await service.approve(COMPANY_A, { userId: "u2", name: "Approver Two" }, "co-1");

      expect(prisma.changeOrder.update).toHaveBeenCalledWith({ where: { id: "co-1" }, data: { status: "pending_approval" } });
      expect(prisma.changeOrder.update).toHaveBeenCalledWith({ where: { id: "co-1" }, data: { status: "approved" } });
    });

    it("rejects a second approval attempt from the same user", async () => {
      prisma.changeOrder.findFirst.mockResolvedValue({
        id: "co-1",
        companyId: COMPANY_A,
        status: "pending_approval",
        number: 1,
        title: "Extra work",
        grandTotal: 5000,
        lines: [{ id: "line-1" }],
        approvals: [{ userId: "u1" }],
      });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ changeOrderApprovalThresholdAmount: 1000, changeOrderRequiredApprovalCount: 2 });
      prisma.changeOrderApproval.findUnique.mockResolvedValue({ changeOrderId: "co-1", userId: "u1" });

      await expect(service.approve(COMPANY_A, { userId: "u1", name: "Approver One" }, "co-1")).rejects.toThrow(BadRequestException);
      expect(prisma.changeOrderApproval.create).not.toHaveBeenCalled();
    });
  });

  describe("send()", () => {
    it("rejects sending a change order that hasn't been approved internally yet", async () => {
      prisma.changeOrder.findFirst.mockResolvedValue({
        id: "co-1",
        companyId: COMPANY_A,
        status: "draft",
        number: 1,
        title: "Extra work",
        lines: [],
      });

      await expect(service.send(COMPANY_A, { name: "Owner" }, "co-1")).rejects.toThrow(BadRequestException);
      expect(prisma.changeOrder.update).not.toHaveBeenCalled();
    });
  });

  describe("decide()", () => {
    it("rejects an unknown token", async () => {
      prisma.changeOrder.findFirst.mockResolvedValue(null);

      await expect(service.decide("bad-token", { decision: "approved" })).rejects.toThrow(NotFoundException);
    });

    it("rejects a change order that was already decided", async () => {
      prisma.changeOrder.findFirst.mockResolvedValue({
        id: "co-1",
        companyId: COMPANY_A,
        number: 1,
        title: "Extra work",
        clientDecision: "approved",
      });

      await expect(service.decide("some-token", { decision: "rejected" })).rejects.toThrow(BadRequestException);
      expect(prisma.changeOrder.update).not.toHaveBeenCalled();
    });

    it("stores the signature image and signer name on approval", async () => {
      prisma.changeOrder.findFirst.mockResolvedValue({
        id: "co-1",
        companyId: COMPANY_A,
        number: 1,
        title: "Extra work",
        clientDecision: "pending",
      });
      prisma.changeOrder.update.mockResolvedValue({ clientDecision: "approved" });
      const storage: { save: jest.Mock } = (service as any).storage;
      storage.save.mockResolvedValue({ storageKey: "company-a/signature.png", size: 42 });

      await service.decide(
        "some-token",
        { decision: "approved", signerName: "Jane Client", signatureDataUrl: "data:image/png;base64,AAAA" },
        "203.0.113.5",
      );

      expect(storage.save).toHaveBeenCalledWith(COMPANY_A, "signature.png", expect.any(Buffer));
      expect(prisma.changeOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            signerName: "Jane Client",
            signatureImageKey: "company-a/signature.png",
            signedIp: "203.0.113.5",
          }),
        }),
      );
    });

    it("decideForClient() rejects a change order that doesn't belong to this client (portal ownership check)", async () => {
      prisma.changeOrder.findFirst.mockResolvedValue(null);

      await expect(
        service.decideForClient(COMPANY_A, "client-1", "co-1", { decision: "rejected" }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.changeOrder.findFirst).toHaveBeenCalledWith({
        where: { id: "co-1", companyId: COMPANY_A, sentAt: { not: null }, estimate: { project: { clientId: "client-1" } } },
      });
      expect(prisma.changeOrder.update).not.toHaveBeenCalled();
    });
  });

  describe("recompute() with tiered markup rules", () => {
    it("applies a labor-specific MarkupRule instead of the estimate's flat percent, falling back to flat for materials", async () => {
      prisma.changeOrder.findFirst.mockResolvedValue({
        id: "co-1",
        companyId: COMPANY_A,
        estimateId: "estimate-1",
        status: "draft",
        lines: [{ id: "line-1", rateCatalogItemId: "rate-1", quantity: 10 }],
      });
      prisma.rateCatalogItem.findFirst.mockResolvedValue({ id: "rate-1", companyId: COMPANY_A });
      prisma.estimate.findUniqueOrThrow.mockResolvedValue({ id: "estimate-1", laborRatePerHour: 50, markupPercent: 10, taxPercent: 5 });
      prisma.rateCatalogItem.findMany.mockResolvedValue([{ id: "rate-1", laborHoursPerUnit: 1, materials: [] }]);
      prisma.markupRule.findMany.mockResolvedValue([{ costType: "labor", markupPercent: 30 }]);

      await service.addLine(COMPANY_A, "co-1", { rateCatalogItemId: "rate-1", quantity: 10 });

      // laborCost = 10 * 1 * 50 = 500, materialsCost = 0 → tiered markup = 0*10% (materials fallback) + 500*30% (labor rule) = 150
      // tax = (500+150)*5% = 32.5, grandTotal = 682.5 — the flat-rate path would have given markup 50 / grandTotal 577.5.
      expect(prisma.changeOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ markupAmount: 150, taxAmount: 32.5, grandTotal: 682.5 }) }),
      );
    });

    it("uses the estimate's flat markup percent when no MarkupRule is configured", async () => {
      prisma.changeOrder.findFirst.mockResolvedValue({
        id: "co-1",
        companyId: COMPANY_A,
        estimateId: "estimate-1",
        status: "draft",
        lines: [{ id: "line-1", rateCatalogItemId: "rate-1", quantity: 10 }],
      });
      prisma.rateCatalogItem.findFirst.mockResolvedValue({ id: "rate-1", companyId: COMPANY_A });
      prisma.estimate.findUniqueOrThrow.mockResolvedValue({ id: "estimate-1", laborRatePerHour: 50, markupPercent: 10, taxPercent: 5 });
      prisma.rateCatalogItem.findMany.mockResolvedValue([{ id: "rate-1", laborHoursPerUnit: 1, materials: [] }]);
      prisma.markupRule.findMany.mockResolvedValue([]);

      await service.addLine(COMPANY_A, "co-1", { rateCatalogItemId: "rate-1", quantity: 10 });

      expect(prisma.changeOrder.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ markupAmount: 50 }) }));
    });
  });

  describe("setScheduleImpact()", () => {
    it("rejects setting schedule impact once the change order is no longer a draft", async () => {
      prisma.changeOrder.findFirst.mockResolvedValue({ id: "co-1", companyId: COMPANY_A, status: "approved", lines: [] });

      await expect(service.setScheduleImpact(COMPANY_A, "co-1", { scheduleImpactDays: 5 })).rejects.toThrow(BadRequestException);
      expect(prisma.changeOrder.update).not.toHaveBeenCalled();
    });

    it("persists the schedule impact in days", async () => {
      prisma.changeOrder.findFirst.mockResolvedValue({ id: "co-1", companyId: COMPANY_A, status: "draft", lines: [] });
      prisma.changeOrder.update.mockResolvedValue({ id: "co-1", scheduleImpactDays: 7 });

      const result = await service.setScheduleImpact(COMPANY_A, "co-1", { scheduleImpactDays: 7 });

      expect(prisma.changeOrder.update).toHaveBeenCalledWith({ where: { id: "co-1" }, data: { scheduleImpactDays: 7 } });
      expect(result.scheduleImpactDays).toBe(7);
    });
  });

  // Regression: the frontend's approval-chain progress display reads co.approvals.length
  // unconditionally (estimate-detail.tsx), so both read paths must always include it —
  // list() previously omitted it and crashed the estimate detail page with a pending change order.
  describe("list() and get() include approvals", () => {
    it("list() requests approvals alongside lines", async () => {
      prisma.changeOrder.findMany.mockResolvedValue([]);

      await service.list(COMPANY_A, "estimate-1");

      expect(prisma.changeOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ include: expect.objectContaining({ approvals: true }) }),
      );
    });

    it("get() requests approvals alongside lines", async () => {
      prisma.changeOrder.findFirst.mockResolvedValue({ id: "co-1", companyId: COMPANY_A });

      await service.get(COMPANY_A, "co-1");

      expect(prisma.changeOrder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ include: expect.objectContaining({ approvals: true }) }),
      );
    });
  });

  describe("profitability()", () => {
    it("rejects an estimate that doesn't belong to this company", async () => {
      prisma.estimate.findFirst.mockResolvedValue(null);
      await expect(service.profitability(COMPANY_A, "estimate-1")).rejects.toThrow(NotFoundException);
    });

    it("only pulls approved change orders into the comparison", async () => {
      prisma.estimate.findFirst.mockResolvedValue({ materialsCostTotal: "6000", laborCostTotal: "4000", grandTotal: "12000" });
      prisma.changeOrder.findMany.mockResolvedValue([]);

      await service.profitability(COMPANY_A, "estimate-1");

      expect(prisma.changeOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: COMPANY_A, estimateId: "estimate-1", status: "approved" } }),
      );
    });

    it("compares the base contract's margin against its approved change orders", async () => {
      prisma.estimate.findFirst.mockResolvedValue({ materialsCostTotal: "6000", laborCostTotal: "4000", grandTotal: "12000" });
      prisma.changeOrder.findMany.mockResolvedValue([
        { id: "co-1", number: 1, title: "Add deck", materialsCostTotal: "1000", laborCostTotal: "500", grandTotal: "2000" },
      ]);

      const result = await service.profitability(COMPANY_A, "estimate-1");

      expect(result.baseContract).toMatchObject({ cost: 10000, revenue: 12000, margin: 2000 });
      expect(result.changeOrders[0]).toMatchObject({ id: "co-1", title: "Add deck", cost: 1500, revenue: 2000, margin: 500 });
    });
  });
});
