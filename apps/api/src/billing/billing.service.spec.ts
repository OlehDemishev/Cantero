import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { BillingService } from "./billing.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { InvoicesService } from "../finance/invoices.service";

const COMPANY_A = "company-a";

describe("BillingService", () => {
  let service: BillingService;
  let prisma: {
    subscription: { findUniqueOrThrow: jest.Mock };
    invoice: { findFirstOrThrow: jest.Mock };
    payment: { aggregate: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
  };
  let invoices: { recordPayment: jest.Mock };
  let stripe: {
    billingPortal: { sessions: { create: jest.Mock } };
    checkout: { sessions: { create: jest.Mock } };
  };

  beforeEach(async () => {
    prisma = {
      subscription: { findUniqueOrThrow: jest.fn() },
      invoice: { findFirstOrThrow: jest.fn() },
      payment: { aggregate: jest.fn() },
      company: { findUniqueOrThrow: jest.fn() },
    };
    invoices = { recordPayment: jest.fn() };

    const config = {
      getOrThrow: jest.fn().mockReturnValue("sk_test_fake"),
      get: jest.fn().mockReturnValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: InvoicesService, useValue: invoices },
      ],
    }).compile();

    service = module.get(BillingService);

    stripe = {
      billingPortal: { sessions: { create: jest.fn() } },
      checkout: { sessions: { create: jest.fn() } },
    };
    // The Stripe SDK client is constructed internally rather than injected — swap it for a
    // mock post-construction so these tests never hit the real Stripe API.
    (service as unknown as { stripe: unknown }).stripe = stripe;
  });

  describe("createPortalSession", () => {
    it("refuses when the company has no Stripe customer yet", async () => {
      prisma.subscription.findUniqueOrThrow.mockResolvedValue({ stripeCustomerId: null });

      await expect(service.createPortalSession(COMPANY_A, "https://app/settings")).rejects.toThrow(BadRequestException);
      expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
    });

    it("creates a portal session for an existing customer", async () => {
      prisma.subscription.findUniqueOrThrow.mockResolvedValue({ stripeCustomerId: "cus_1" });
      stripe.billingPortal.sessions.create.mockResolvedValue({ url: "https://billing.stripe.com/session/x" });

      const result = await service.createPortalSession(COMPANY_A, "https://app/settings");

      expect(result).toEqual({ url: "https://billing.stripe.com/session/x" });
      expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: "cus_1",
        return_url: "https://app/settings",
      });
    });
  });

  describe("createInvoiceCheckoutSession", () => {
    it("refuses an invoice that isn't in 'sent' status", async () => {
      prisma.invoice.findFirstOrThrow.mockResolvedValue({ id: "inv-1", status: "draft", total: "100", number: "INV-1" });

      await expect(service.createInvoiceCheckoutSession(COMPANY_A, "inv-1", "c@x.com")).rejects.toThrow(BadRequestException);
    });

    it("refuses an invoice that's already paid in full", async () => {
      prisma.invoice.findFirstOrThrow.mockResolvedValue({ id: "inv-1", status: "sent", total: "100", number: "INV-1" });
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: "100" } });

      await expect(service.createInvoiceCheckoutSession(COMPANY_A, "inv-1", "c@x.com")).rejects.toThrow(BadRequestException);
    });

    it("creates a payment-mode checkout session for the outstanding balance", async () => {
      prisma.invoice.findFirstOrThrow.mockResolvedValue({ id: "inv-1", status: "sent", total: "100", number: "INV-1" });
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: "40" } });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ currency: "EUR" });
      stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/x" });

      const result = await service.createInvoiceCheckoutSession(COMPANY_A, "inv-1", "c@x.com");

      expect(result).toEqual({ url: "https://checkout.stripe.com/x" });
      const call = stripe.checkout.sessions.create.mock.calls[0][0];
      expect(call.mode).toBe("payment");
      expect(call.line_items[0].price_data.unit_amount).toBe(6000); // (100 - 40) * 100
      expect(call.metadata).toEqual({ companyId: COMPANY_A, invoiceId: "inv-1", kind: "invoice_payment" });
    });

    it("charges a requested installment amount instead of the full balance when it's smaller", async () => {
      prisma.invoice.findFirstOrThrow.mockResolvedValue({ id: "inv-1", status: "sent", total: "100", number: "INV-1" });
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: "0" } });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ currency: "EUR" });
      stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/x" });

      await service.createInvoiceCheckoutSession(COMPANY_A, "inv-1", "c@x.com", 30);

      const call = stripe.checkout.sessions.create.mock.calls[0][0];
      expect(call.line_items[0].price_data.unit_amount).toBe(3000);
    });

    it("caps a requested amount at the remaining balance rather than trusting it outright", async () => {
      prisma.invoice.findFirstOrThrow.mockResolvedValue({ id: "inv-1", status: "sent", total: "100", number: "INV-1" });
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: "40" } });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ currency: "EUR" });
      stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/x" });

      await service.createInvoiceCheckoutSession(COMPANY_A, "inv-1", "c@x.com", 9999);

      const call = stripe.checkout.sessions.create.mock.calls[0][0];
      expect(call.line_items[0].price_data.unit_amount).toBe(6000); // capped at the (100-40) balance
    });
  });

  describe("handleWebhookEvent — invoice payments", () => {
    it("records a payment when a payment-mode checkout session completes", async () => {
      await service.handleWebhookEvent({
        type: "checkout.session.completed",
        data: {
          object: {
            mode: "payment",
            amount_total: 6000,
            metadata: { kind: "invoice_payment", companyId: COMPANY_A, invoiceId: "inv-1" },
          },
        },
      } as never);

      expect(invoices.recordPayment).toHaveBeenCalledWith(
        COMPANY_A,
        { userId: "stripe", name: "Online payment" },
        "inv-1",
        { amount: 60, method: "card" },
      );
    });

    it("does not record a payment for a subscription-mode session", async () => {
      await service.handleWebhookEvent({
        type: "checkout.session.completed",
        data: {
          object: { mode: "subscription", metadata: { companyId: COMPANY_A }, subscription: null },
        },
      } as never);

      expect(invoices.recordPayment).not.toHaveBeenCalled();
    });
  });
});
