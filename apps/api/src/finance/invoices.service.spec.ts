import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { InvoicesService } from "./invoices.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { OutboxService } from "../common/webhooks/outbox.service";
import { ExchangeRateService } from "../common/exchange-rate/exchange-rate.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Accountant" };

describe("InvoicesService — late fees & payment terms", () => {
  let service: InvoicesService;
  let prisma: {
    invoice: { findFirst: jest.Mock; update: jest.Mock; create: jest.Mock; count: jest.Mock };
    invoiceLine: { create: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
    payment: { create: jest.Mock; findMany: jest.Mock };
    estimate: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let mail: { send: jest.Mock };
  let exchangeRates: { getRate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      invoice: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      invoiceLine: { create: jest.fn() },
      company: { findUniqueOrThrow: jest.fn() },
      payment: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      estimate: { findFirst: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
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
        { provide: OutboxService, useValue: { enqueue: jest.fn() } },
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
        lateFeeChargedTotal: 0,
        lastLateFeeAccrualAt: null,
        payments: [],
      });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ lateFeePercentPerMonth: 1.5 });
      prisma.invoice.update.mockResolvedValue({ id: "inv-1", total: 1015 });

      await service.chargeLateFee(COMPANY_A, ACTOR, "inv-1");

      expect(prisma.invoiceLine.create).toHaveBeenCalledWith({
        data: { invoiceId: "inv-1", description: "Late fee", quantity: 1, unitPrice: 15, lineTotal: 15 },
      });
      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "inv-1" },
          data: { total: { increment: 15 }, lateFeeChargedTotal: { increment: 15 }, lastLateFeeAccrualAt: expect.any(Date) },
        }),
      );
    });

    it("does not compound: charging again the same day (no new overdue time) accrues nothing more", async () => {
      // Reproduces the audit's exact scenario: $1000, 30 days overdue, 1%/month. First charge is
      // 10.00; a second charge moments later (no new day passed) must accrue 0, not another 10.10
      // computed off the whole period again and the already-charged fee.
      const now = new Date();
      prisma.invoice.findFirst.mockResolvedValue({
        id: "inv-1",
        number: "INV-0001",
        status: "sent",
        dueDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        total: 1010,
        lateFeeChargedTotal: 10,
        lastLateFeeAccrualAt: now,
        payments: [],
      });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ lateFeePercentPerMonth: 1 });

      await expect(service.chargeLateFee(COMPANY_A, ACTOR, "inv-1")).rejects.toThrow(BadRequestException);
      expect(prisma.invoiceLine.create).not.toHaveBeenCalled();
    });

    it("accrues only the fee for the days since the last charge, on the principal balance", async () => {
      // $1000 principal, first charge already took $10 (now total=1010, lateFeeChargedTotal=10,
      // charged 30 days ago). A further 30 days have passed since that charge at 1%/month: the
      // new accrual must be 1000 * 1% * 1 = 10, not (1010 - 10) * ... nor computed from dueDate again.
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      prisma.invoice.findFirst.mockResolvedValue({
        id: "inv-1",
        number: "INV-0001",
        status: "sent",
        dueDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        total: 1010,
        lateFeeChargedTotal: 10,
        lastLateFeeAccrualAt: thirtyDaysAgo,
        payments: [],
      });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ lateFeePercentPerMonth: 1 });
      prisma.invoice.update.mockResolvedValue({ id: "inv-1", total: 1020 });

      await service.chargeLateFee(COMPANY_A, ACTOR, "inv-1");

      expect(prisma.invoiceLine.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ unitPrice: 10, lineTotal: 10 }) }),
      );
    });

    it("reads the invoice and posts the fee inside one serializable transaction, closing the race where two concurrent charges could each read the same accrued snapshot and double-post", async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: "inv-1",
        number: "INV-0001",
        status: "sent",
        dueDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        total: 1000,
        lateFeeChargedTotal: 0,
        lastLateFeeAccrualAt: null,
        payments: [],
      });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ lateFeePercentPerMonth: 1.5 });
      prisma.invoice.update.mockResolvedValue({ id: "inv-1", total: 1015 });

      await service.chargeLateFee(COMPANY_A, ACTOR, "inv-1");

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    });
  });

  describe("generateProgressInvoice() — void draws don't count as the last draw", () => {
    const ESTIMATE = {
      id: "est-1",
      grandTotal: 1000,
      status: "approved",
      project: { id: "proj-1", clientId: "client-1" },
    };

    it("bases the next draw on the last non-void draw, ignoring a voided one that billed further", async () => {
      prisma.estimate.findFirst.mockResolvedValue(ESTIMATE);
      // A 60% draw was voided; the real last draw still standing is 40%.
      prisma.invoice.findFirst.mockResolvedValue({ percentComplete: 40 });
      prisma.invoice.create.mockResolvedValue({ id: "inv-2", percentComplete: 50 });

      await service.generateProgressInvoice(COMPANY_A, "est-1", { estimateId: "est-1", percentComplete: 50, retainagePercent: 0 });

      expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: { not: "void" } }) }),
      );
      // 50% - 40% (not 50% - 60%, which would have gone negative/rejected) of 1000.
      expect(prisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ subtotal: 100 }) }),
      );
    });

    it("allows re-billing a percentage that was already invoiced once the draw covering it is void", async () => {
      prisma.estimate.findFirst.mockResolvedValue(ESTIMATE);
      // Simulates the exclusion actually taking effect: with the 60% draw voided and excluded,
      // Prisma's own ordering would surface the next-highest non-void draw (40%) here.
      prisma.invoice.findFirst.mockResolvedValue({ percentComplete: 40 });
      prisma.invoice.create.mockResolvedValue({ id: "inv-2", percentComplete: 60 });

      await expect(
        service.generateProgressInvoice(COMPANY_A, "est-1", { estimateId: "est-1", percentComplete: 60, retainagePercent: 0 }),
      ).resolves.toBeDefined();
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

    it("ignores a redelivered Stripe webhook for a checkout session already recorded, instead of double-crediting it", async () => {
      // Stripe explicitly does not guarantee exactly-once webhook delivery — a second delivery of
      // the same checkout.session.completed event must not create a second Payment row.
      prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
      const clashError = Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { target: ["stripeCheckoutSessionId"] },
      });
      Object.setPrototypeOf(clashError, Prisma.PrismaClientKnownRequestError.prototype);
      prisma.payment.create.mockRejectedValue(clashError);

      const result = await service.recordPayment(COMPANY_A, ACTOR, "inv-1", { amount: 60, method: "card" }, "cs_test_abc123");

      expect(result).toEqual(baseInvoice);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("stores the Stripe checkout session id on the payment when given one", async () => {
      prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
      prisma.invoice.update.mockResolvedValue({ ...baseInvoice, status: "paid" });

      await service.recordPayment(COMPANY_A, ACTOR, "inv-1", { amount: 1000, method: "card" }, "cs_test_abc123");

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ stripeCheckoutSessionId: "cs_test_abc123" }) }),
      );
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
        { provide: OutboxService, useValue: { enqueue: jest.fn() } },
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
