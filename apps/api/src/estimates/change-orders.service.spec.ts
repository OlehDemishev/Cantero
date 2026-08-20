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
    changeOrder: { count: jest.Mock; create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    changeOrderLine: { create: jest.Mock };
    rateCatalogItem: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      estimate: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
      changeOrder: { count: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      changeOrderLine: { create: jest.fn() },
      rateCatalogItem: { findFirst: jest.fn() },
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
});
