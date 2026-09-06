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
import { ExchangeRateService } from "../common/exchange-rate/exchange-rate.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Accountant" };

describe("InvoicesService — late fees & payment terms", () => {
  let service: InvoicesService;
  let prisma: {
    invoice: { findFirst: jest.Mock; update: jest.Mock };
    invoiceLine: { create: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
    payment: { create: jest.Mock; findMany: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let mail: { send: jest.Mock };
  let exchangeRates: { getRate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      invoice: { findFirst: jest.fn(), update: jest.fn() },
      invoiceLine: { create: jest.fn() },
      company: { findUniqueOrThrow: jest.fn() },
      payment: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    };
    audit = { record: jest.fn() };
    mail = { send: jest.fn() };
    exchangeRates = { getRate: jest.fn() };

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
        { provide: ExchangeRateService, useValue: exchangeRates },
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

  describe("send() — client-locale email", () => {
    it("sends the notification email in the client's preferredLocale, not the company's own", async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: "inv-1",
        number: "INV-0001",
        status: "draft",
        dueDate: new Date(),
        total: 1000,
        currency: "EUR",
        lines: [],
        client: { email: "client@example.com", name: "Acme", paymentTermsDays: null, preferredLocale: "uk" },
        project: { name: "Project" },
      });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ name: "Acme Construction", locale: "en", logoStorageKey: null, brandColor: null });
      prisma.invoice.update.mockResolvedValue({
        id: "inv-1",
        number: "INV-0001",
        total: 1000,
        currency: "EUR",
        client: { email: "client@example.com", preferredLocale: "uk" },
      });

      await service.send(COMPANY_A, ACTOR, "inv-1");

      expect(mail.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: "client@example.com", subject: expect.stringContaining("Рахунок") }),
      );
    });

    it("falls back to the company's own locale when the client has none set", async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: "inv-1",
        number: "INV-0001",
        status: "draft",
        dueDate: new Date(),
        total: 1000,
        currency: "EUR",
        lines: [],
        client: { email: "client@example.com", name: "Acme", paymentTermsDays: null, preferredLocale: null },
        project: { name: "Project" },
      });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ name: "Acme Construction", locale: "de", logoStorageKey: null, brandColor: null });
      prisma.invoice.update.mockResolvedValue({
        id: "inv-1",
        number: "INV-0001",
        total: 1000,
        currency: "EUR",
        client: { email: "client@example.com", preferredLocale: null },
      });

      await service.send(COMPANY_A, ACTOR, "inv-1");

      expect(mail.send).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.stringContaining("Rechnung") }),
      );
    });
  });

  describe("recordPayment()", () => {
    const baseInvoice = { id: "inv-1", number: "INV-0001", status: "sent", currency: "EUR", total: 1000 };

    it("records a same-currency payment at face value, with no FX fields", async () => {
      prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
      prisma.invoice.update.mockResolvedValue({ ...baseInvoice, status: "sent" });

      await service.recordPayment(COMPANY_A, ACTOR, "inv-1", { amount: 400, method: "bank_transfer" });

      expect(prisma.payment.create).toHaveBeenCalledWith({ data: { invoiceId: "inv-1", amount: 400, method: "bank_transfer" } });
      expect(exchangeRates.getRate).not.toHaveBeenCalled();
    });

    it("converts a foreign-currency payment using the actual rate and records the FX gain against the benchmark", async () => {
      prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
      prisma.invoice.update.mockResolvedValue({ ...baseInvoice, status: "sent" });
      exchangeRates.getRate.mockResolvedValue(1.08);

      await service.recordPayment(COMPANY_A, ACTOR, "inv-1", {
        method: "bank_transfer",
        foreignPayment: { currency: "USD", foreignAmount: 1000, exchangeRate: 1.1 },
      });

      expect(exchangeRates.getRate).toHaveBeenCalledWith("USD", "EUR");
      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: {
          invoiceId: "inv-1",
          amount: 1100,
          method: "bank_transfer",
          currency: "USD",
          foreignAmount: 1000,
          exchangeRate: 1.1,
          fxGainLoss: 20,
        },
      });
    });

    it("records a foreign-currency payment with a null fxGainLoss when no benchmark rate is on file", async () => {
      prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
      prisma.invoice.update.mockResolvedValue({ ...baseInvoice, status: "sent" });
      exchangeRates.getRate.mockResolvedValue(null);

      await service.recordPayment(COMPANY_A, ACTOR, "inv-1", {
        method: "bank_transfer",
        foreignPayment: { currency: "USD", foreignAmount: 1000, exchangeRate: 1.1 },
      });

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ fxGainLoss: null }) }),
      );
    });

    it("rejects a payment against a draft invoice", async () => {
      prisma.invoice.findFirst.mockResolvedValue({ ...baseInvoice, status: "draft" });
      await expect(service.recordPayment(COMPANY_A, ACTOR, "inv-1", { amount: 100, method: "cash" })).rejects.toThrow(BadRequestException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });
  });
});

describe("InvoicesService — partial retainage release", () => {
  let service: InvoicesService;
  let prisma: {
    estimate: { findFirst: jest.Mock };
    invoice: { findMany: jest.Mock; count: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      estimate: { findFirst: jest.fn() },
      invoice: { findMany: jest.fn(), count: jest.fn().mockResolvedValue(0), create: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: { render: jest.fn() } },
        { provide: StorageService, useValue: { read: jest.fn(), save: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: MailService, useValue: { send: jest.fn() } },
        { provide: WebhooksService, useValue: { trigger: jest.fn() } },
        { provide: ExchangeRateService, useValue: { getRate: jest.fn(), convert: jest.fn((amount: number) => Promise.resolve(amount)) } },
      ],
    }).compile();

    service = module.get(InvoicesService);
  });

  function mockEstimate() {
    prisma.estimate.findFirst.mockResolvedValue({
      id: "est-1",
      status: "approved",
      currency: "USD",
      project: { id: "project-1", clientId: "client-1" },
    });
  }

  it("throws when there's no retainage held at all", async () => {
    mockEstimate();
    prisma.invoice.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(service.releaseRetainage(COMPANY_A, "est-1", {})).rejects.toThrow(BadRequestException);
  });

  it("releases everything remaining when no amount is given", async () => {
    mockEstimate();
    prisma.invoice.findMany.mockResolvedValueOnce([{ retainageAmount: "1000" }]).mockResolvedValueOnce([]);
    prisma.invoice.create.mockResolvedValue({ id: "inv-release-1" });

    await service.releaseRetainage(COMPANY_A, "est-1", {});

    expect(prisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ total: 1000, isRetainageRelease: true }) }),
    );
  });

  it("releases a partial amount, leaving the rest available for a later release", async () => {
    mockEstimate();
    prisma.invoice.findMany.mockResolvedValueOnce([{ retainageAmount: "1000" }]).mockResolvedValueOnce([]);
    prisma.invoice.create.mockResolvedValue({ id: "inv-release-1" });

    await service.releaseRetainage(COMPANY_A, "est-1", { amount: 400 });

    expect(prisma.invoice.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ total: 400 }) }));
  });

  it("rejects a second release once everything held has already been released", async () => {
    mockEstimate();
    prisma.invoice.findMany.mockResolvedValueOnce([{ retainageAmount: "1000" }]).mockResolvedValueOnce([{ total: "1000" }]);

    await expect(service.releaseRetainage(COMPANY_A, "est-1", {})).rejects.toThrow(BadRequestException);
  });

  it("rejects a release amount larger than what's still remaining", async () => {
    mockEstimate();
    prisma.invoice.findMany.mockResolvedValueOnce([{ retainageAmount: "1000" }]).mockResolvedValueOnce([{ total: "400" }]);

    await expect(service.releaseRetainage(COMPANY_A, "est-1", { amount: 700 })).rejects.toThrow(BadRequestException);
  });

  it("allows a second partial release for the remainder after a first partial release", async () => {
    mockEstimate();
    prisma.invoice.findMany.mockResolvedValueOnce([{ retainageAmount: "1000" }]).mockResolvedValueOnce([{ total: "400" }]);
    prisma.invoice.create.mockResolvedValue({ id: "inv-release-2" });

    await service.releaseRetainage(COMPANY_A, "est-1", { amount: 600 });

    expect(prisma.invoice.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ total: 600 }) }));
  });
});
