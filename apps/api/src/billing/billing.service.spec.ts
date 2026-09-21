import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { BillingService } from "./billing.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { InvoicesService } from "../finance/invoices.service";
import { ClientPaymentMethodsService } from "../finance/client-payment-methods.service";

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
        { provide: ClientPaymentMethodsService, useValue: { handleSetupSessionCompleted: jest.fn() } },
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

  describe("constructWebhookEvent", () => {
    // The real SDK, not the mock above: this is about Stripe's own signature check. The config
    // mock returns "sk_test_fake" for every key, so that's also the webhook secret here.
    const payload = JSON.stringify({ id: "evt_1", object: "event", type: "payment_intent.succeeded", data: { object: {} } });
    beforeEach(() => {
      (service as unknown as { stripe: unknown }).stripe = new Stripe("sk_test_fake");
    });

    it("returns the event for a correctly signed payload", () => {
      const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: "sk_test_fake" });
      expect(service.constructWebhookEvent(Buffer.from(payload), header).id).toBe("evt_1");
    });

    it("maps a forged signature to a 400, not an unhandled 500", () => {
      const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_someone_else" });
      expect(() => service.constructWebhookEvent(Buffer.from(payload), header)).toThrow(BadRequestException);
    });
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
      prisma.invoice.findFirstOrThrow.mockResolvedValue({ id: "inv-1", status: "sent", total: "100", number: "INV-1", currency: "EUR" });
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: "40" } });
      stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/x" });

      const result = await service.createInvoiceCheckoutSession(COMPANY_A, "inv-1", "c@x.com");

      expect(result).toEqual({ url: "https://checkout.stripe.com/x" });
      const call = stripe.checkout.sessions.create.mock.calls[0][0];
      expect(call.mode).toBe("payment");
      expect(call.line_items[0].price_data.unit_amount).toBe(6000); // (100 - 40) * 100
      expect(call.metadata).toEqual({ companyId: COMPANY_A, invoiceId: "inv-1", kind: "invoice_payment" });
    });

    it("charges a requested installment amount instead of the full balance when it's smaller", async () => {
      prisma.invoice.findFirstOrThrow.mockResolvedValue({ id: "inv-1", status: "sent", total: "100", number: "INV-1", currency: "EUR" });
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: "0" } });
      stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/x" });

      await service.createInvoiceCheckoutSession(COMPANY_A, "inv-1", "c@x.com", 30);

      const call = stripe.checkout.sessions.create.mock.calls[0][0];
      expect(call.line_items[0].price_data.unit_amount).toBe(3000);
    });

    it("caps a requested amount at the remaining balance rather than trusting it outright", async () => {
      prisma.invoice.findFirstOrThrow.mockResolvedValue({ id: "inv-1", status: "sent", total: "100", number: "INV-1", currency: "EUR" });
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: "40" } });
      stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/x" });

      await service.createInvoiceCheckoutSession(COMPANY_A, "inv-1", "c@x.com", 9999);

      const call = stripe.checkout.sessions.create.mock.calls[0][0];
      expect(call.line_items[0].price_data.unit_amount).toBe(6000); // capped at the (100-40) balance
    });

    it("charges in the invoice's own currency even when it differs from the company's default", async () => {
      // The audit's exact scenario: a USD invoice under a EUR-default company must not silently
      // become a EUR charge for the same numeric amount.
      prisma.invoice.findFirstOrThrow.mockResolvedValue({ id: "inv-1", status: "sent", total: "100", number: "INV-1", currency: "USD" });
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: "0" } });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ currency: "EUR" });
      stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/x" });

      await service.createInvoiceCheckoutSession(COMPANY_A, "inv-1", "c@x.com");

      const call = stripe.checkout.sessions.create.mock.calls[0][0];
      expect(call.line_items[0].price_data.currency).toBe("usd");
      expect(prisma.company.findUniqueOrThrow).not.toHaveBeenCalled();
    });
  });

  describe("handleWebhookEvent — invoice payments", () => {
    it("records a payment when a payment-mode checkout session completes, passing the session id for dedup", async () => {
      await service.handleWebhookEvent({
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_abc123",
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
        "cs_test_abc123",
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

  describe("handleWebhookEvent — autopay bank debit settlement", () => {
    it("records the payment once a SEPA/ACH autopay PaymentIntent settles, using its id for dedup", async () => {
      await service.handleWebhookEvent({
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_test_abc",
            amount: 15000,
            metadata: { kind: "autopay", companyId: COMPANY_A, invoiceId: "inv-1", method: "bank_transfer" },
          },
        },
      } as never);

      expect(invoices.recordPayment).toHaveBeenCalledWith(
        COMPANY_A,
        { userId: "stripe", name: "Online payment" },
        "inv-1",
        { amount: 150, method: "bank_transfer" },
        "pi_test_abc",
      );
    });

    it("does not record a payment when the autopay bank debit fails", async () => {
      await service.handleWebhookEvent({
        type: "payment_intent.payment_failed",
        data: {
          object: {
            id: "pi_test_fail",
            amount: 15000,
            metadata: { kind: "autopay", companyId: COMPANY_A, invoiceId: "inv-1", method: "bank_transfer" },
            last_payment_error: { message: "insufficient funds" },
          },
        },
      } as never);

      expect(invoices.recordPayment).not.toHaveBeenCalled();
    });

    it("ignores a payment_intent event that isn't from autopay", async () => {
      await service.handleWebhookEvent({
        type: "payment_intent.succeeded",
        data: {
          object: { id: "pi_unrelated", amount: 5000, metadata: {} },
        },
      } as never);

      expect(invoices.recordPayment).not.toHaveBeenCalled();
    });
  });
});
