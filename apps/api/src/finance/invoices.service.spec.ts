import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { InvoicesService } from "./invoices.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Accountant" };

describe("InvoicesService — late fees & payment terms", () => {
  let service: InvoicesService;
  let prisma: {
    invoice: { findFirst: jest.Mock; update: jest.Mock };
    invoiceLine: { create: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let mail: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      invoice: { findFirst: jest.fn(), update: jest.fn() },
      invoiceLine: { create: jest.fn() },
      company: { findUniqueOrThrow: jest.fn() },
    };
    audit = { record: jest.fn() };
    mail = { send: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: { render: jest.fn() } },
        { provide: StorageService, useValue: { read: jest.fn(), save: jest.fn() } },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: MailService, useValue: mail },
        { provide: WebhooksService, useValue: { trigger: jest.fn() } },
      ],
    }).compile();

    service = module.get(InvoicesService);
  });

  describe("get() — lateFeeAccrued", () => {
    it("is 0 for a draft invoice regardless of dueDate", async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        status: "draft",
        dueDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        total: 1000,
        payments: [],
      });

      const result = await service.get(COMPANY_A, "inv-1");

      expect(result.lateFeeAccrued).toBe(0);
      expect(prisma.company.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("is 0 when the company has no late-fee rate configured", async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        status: "sent",
        dueDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        total: 1000,
        payments: [],
      });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ lateFeePercentPerMonth: null });

      const result = await service.get(COMPANY_A, "inv-1");

      expect(result.lateFeeAccrued).toBe(0);
    });

    it("computes the accrued fee against the outstanding balance net of payments already made", async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        status: "sent",
        dueDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        total: 1000,
        payments: [{ amount: 500 }],
      });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ lateFeePercentPerMonth: 1.5 });

      const result = await service.get(COMPANY_A, "inv-1");

      // 500 outstanding * 1.5% * 1 month = 7.5
      expect(result.lateFeeAccrued).toBe(7.5);
    });
  });

  describe("chargeLateFee()", () => {
    it("refuses to charge when nothing has accrued", async () => {
      prisma.invoice.findFirst.mockResolvedValue({ status: "sent", dueDate: null, total: 1000, payments: [] });

      await expect(service.chargeLateFee(COMPANY_A, ACTOR, "inv-1")).rejects.toThrow(BadRequestException);
      expect(prisma.invoiceLine.create).not.toHaveBeenCalled();
    });

    it("adds a line for the accrued amount and increments the invoice total", async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: "inv-1",
        number: "INV-0001",
        status: "sent",
        dueDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        total: 1000,
        payments: [],
      });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ lateFeePercentPerMonth: 1.5 });
      prisma.invoice.update.mockResolvedValue({ id: "inv-1", total: 1015 });

      await service.chargeLateFee(COMPANY_A, ACTOR, "inv-1");

      expect(prisma.invoiceLine.create).toHaveBeenCalledWith({
        data: { invoiceId: "inv-1", description: "Late fee", quantity: 1, unitPrice: 15, lineTotal: 15 },
      });
      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "inv-1" }, data: { total: { increment: 15 } } }),
      );
    });
  });

  describe("send() — payment terms default due date", () => {
    it("computes dueDate from the client's own payment terms override when set", async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: "inv-1",
        number: "INV-0001",
        status: "draft",
        dueDate: null,
        client: { email: null, name: "Acme", paymentTermsDays: 15 },
      });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ defaultPaymentTermsDays: 30 });
      prisma.invoice.update.mockResolvedValue({ id: "inv-1", client: { email: null } });

      await service.send(COMPANY_A, ACTOR, "inv-1");

      const call = prisma.invoice.update.mock.calls[0][0];
      const daysUntilDue = Math.round((call.data.dueDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      expect(daysUntilDue).toBe(15);
    });

    it("falls back to the company default when the client has no override", async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: "inv-1",
        number: "INV-0001",
        status: "draft",
        dueDate: null,
        client: { email: null, name: "Acme", paymentTermsDays: null },
      });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ defaultPaymentTermsDays: 45 });
      prisma.invoice.update.mockResolvedValue({ id: "inv-1", client: { email: null } });

      await service.send(COMPANY_A, ACTOR, "inv-1");

      const call = prisma.invoice.update.mock.calls[0][0];
      const daysUntilDue = Math.round((call.data.dueDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      expect(daysUntilDue).toBe(45);
    });

    it("leaves an already-set dueDate untouched", async () => {
      const explicitDueDate = new Date("2027-01-01T00:00:00.000Z");
      prisma.invoice.findFirst.mockResolvedValue({
        id: "inv-1",
        number: "INV-0001",
        status: "draft",
        dueDate: explicitDueDate,
        client: { email: null, name: "Acme", paymentTermsDays: null },
      });
      prisma.invoice.update.mockResolvedValue({ id: "inv-1", client: { email: null } });

      await service.send(COMPANY_A, ACTOR, "inv-1");

      const call = prisma.invoice.update.mock.calls[0][0];
      expect(call.data.dueDate).toBe(explicitDueDate);
      expect(prisma.company.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("rejects sending a non-draft invoice", async () => {
      prisma.invoice.findFirst.mockResolvedValue({ status: "sent" });
      await expect(service.send(COMPANY_A, ACTOR, "inv-1")).rejects.toThrow(BadRequestException);
    });

    it("404s on an invoice outside the company", async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      await expect(service.send(COMPANY_A, ACTOR, "inv-1")).rejects.toThrow(NotFoundException);
    });
  });
});
