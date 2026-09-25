import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { BillingService } from "./billing.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { InvoicesService } from "../finance/invoices.service";
import { ClientPaymentMethodsService } from "../finance/client-payment-methods.service";
import { StripeConnectService } from "../finance/stripe-connect.service";

const COMPANY_A = "company-a";
const ACCOUNT_A = "acct_company_a";
const ACCOUNT_B = "acct_company_b";

describe("BillingService", () => {
  let service: BillingService;
  let prisma: {
    subscription: { findUniqueOrThrow: jest.Mock; updateMany: jest.Mock };
    invoice: { findFirstOrThrow: jest.Mock };
    payment: { aggregate: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
  };
  let invoices: { recordPayment: jest.Mock };
  let connect: { chargeableAccountFor: jest.Mock; accountBelongsTo: jest.Mock; handleAccountUpdated: jest.Mock; handleDeauthorized: jest.Mock };
  let clientPaymentMethods: { handleSetupSessionCompleted: jest.Mock };
  let stripe: {
    billingPortal: { sessions: { create: jest.Mock } };
    checkout: { sessions: { create: jest.Mock } };
  };

  beforeEach(async () => {
    prisma = {
      subscription: { findUniqueOrThrow: jest.fn(), updateMany: jest.fn() },
      invoice: { findFirstOrThrow: jest.fn() },
      payment: { aggregate: jest.fn() },
      company: { findUniqueOrThrow: jest.fn() },
    };
    invoices = { recordPayment: jest.fn() };
    connect = {
      chargeableAccountFor: jest.fn().mockResolvedValue(ACCOUNT_A),
      accountBelongsTo: jest.fn(async (account: string, companyId: string) => account === ACCOUNT_A && companyId === COMPANY_A),
      handleAccountUpdated: jest.fn(),
      handleDeauthorized: jest.fn(),
    };
    clientPaymentMethods = { handleSetupSessionCompleted: jest.fn() };

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
        { provide: ClientPaymentMethodsService, useValue: clientPaymentMethods },
        { provide: StripeConnectService, useValue: connect },
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
    it("refuses when the company has no chargeable Stripe account, never falling back to the platform's", async () => {
      connect.chargeableAccountFor.mockRejectedValue(new BadRequestException("Online payment isn't set up"));

      await expect(service.createInvoiceCheckoutSession(COMPANY_A, "inv-1", "c@x.com")).rejects.toThrow(BadRequestException);
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it("creates the session on the company's own connected account", async () => {
      prisma.invoice.findFirstOrThrow.mockResolvedValue({ id: "inv-1", status: "sent", total: "100", number: "INV-1", currency: "EUR" });
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: "0" } });
      stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/x" });

      await service.createInvoiceCheckoutSession(COMPANY_A, "inv-1", "c@x.com");

      expect(stripe.checkout.sessions.create.mock.calls[0][1]).toEqual({ stripeAccount: ACCOUNT_A });
    });

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

  const actor = { userId: "stripe", name: "Online payment" };
  function invoiceSessionEvent(type: string, session: Record<string, unknown>, account?: string) {
    return {
      id: "evt_1",
      type,
      account,
      data: {
        object: {
          id: "cs_test_abc123",
          mode: "payment",
          amount_total: 6000,
          payment_status: "paid",
          metadata: { kind: "invoice_payment", companyId: COMPANY_A, invoiceId: "inv-1" },
          ...session,
        },
      },
    } as never;
  }

  describe("handleConnectWebhookEvent — invoice payments", () => {
    it("records a paid checkout on the company's own account, passing the session id for dedup", async () => {
      await service.handleConnectWebhookEvent(invoiceSessionEvent("checkout.session.completed", {}, ACCOUNT_A));

      expect(invoices.recordPayment).toHaveBeenCalledWith(COMPANY_A, actor, "inv-1", { amount: 60, method: "card" }, "cs_test_abc123");
    });

    it("does not record a delayed method (SEPA etc.) whose session completed before the money arrived", async () => {
      await service.handleConnectWebhookEvent(invoiceSessionEvent("checkout.session.completed", { payment_status: "unpaid" }, ACCOUNT_A));

      expect(invoices.recordPayment).not.toHaveBeenCalled();
    });

    it("records a delayed method once it settles", async () => {
      await service.handleConnectWebhookEvent(invoiceSessionEvent("checkout.session.async_payment_succeeded", {}, ACCOUNT_A));

      expect(invoices.recordPayment).toHaveBeenCalledWith(COMPANY_A, actor, "inv-1", { amount: 60, method: "card" }, "cs_test_abc123");
    });

    it("does not record a delayed method that failed", async () => {
      await service.handleConnectWebhookEvent(invoiceSessionEvent("checkout.session.async_payment_failed", { payment_status: "unpaid" }, ACCOUNT_A));

      expect(invoices.recordPayment).not.toHaveBeenCalled();
    });

    it("ignores a session on another company's account that names this company's invoice", async () => {
      // Company B owns ACCOUNT_B and can create any Checkout session on it — including one whose
      // metadata points at company A's invoice. Paying it must not mark A's invoice paid.
      await service.handleConnectWebhookEvent(invoiceSessionEvent("checkout.session.completed", {}, ACCOUNT_B));

      expect(invoices.recordPayment).not.toHaveBeenCalled();
    });

    it("ignores the same forgery for a saved payment method", async () => {
      await service.handleConnectWebhookEvent(
        invoiceSessionEvent("checkout.session.completed", { mode: "setup", metadata: { kind: "save_payment_method", companyId: COMPANY_A, clientId: "client-1" } }, ACCOUNT_B),
      );

      expect(clientPaymentMethods.handleSetupSessionCompleted).not.toHaveBeenCalled();
    });

    it("saves a payment method set up on the company's own account, recording that account", async () => {
      await service.handleConnectWebhookEvent(
        invoiceSessionEvent("checkout.session.completed", { mode: "setup", metadata: { kind: "save_payment_method", companyId: COMPANY_A, clientId: "client-1" } }, ACCOUNT_A),
      );

      expect(clientPaymentMethods.handleSetupSessionCompleted).toHaveBeenCalledWith(expect.objectContaining({ mode: "setup" }), COMPANY_A, ACCOUNT_A);
    });

    it("never touches a Cantero subscription from a connected account's event", async () => {
      await service.handleConnectWebhookEvent({
        id: "evt_sub",
        type: "customer.subscription.deleted",
        account: ACCOUNT_A,
        data: { object: { id: "sub_1", metadata: { companyId: COMPANY_A } } },
      } as never);

      expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
    });

    it("keeps the company's charges_enabled in step with account.updated", async () => {
      const account = { id: ACCOUNT_A, charges_enabled: true };
      await service.handleConnectWebhookEvent({ id: "evt_acct", type: "account.updated", account: ACCOUNT_A, data: { object: account } } as never);

      expect(connect.handleAccountUpdated).toHaveBeenCalledWith(account);
    });
  });

  describe("handleWebhookEvent — platform endpoint", () => {
    it("still records a checkout opened on the platform account before Stripe Connect", async () => {
      await service.handleWebhookEvent(invoiceSessionEvent("checkout.session.completed", {}));

      expect(invoices.recordPayment).toHaveBeenCalledWith(COMPANY_A, actor, "inv-1", { amount: 60, method: "card" }, "cs_test_abc123");
      expect(connect.accountBelongsTo).not.toHaveBeenCalled();
    });

    it("ignores a connected account's event delivered to the platform endpoint", async () => {
      await service.handleWebhookEvent(invoiceSessionEvent("checkout.session.completed", {}, ACCOUNT_A));

      expect(invoices.recordPayment).not.toHaveBeenCalled();
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

  describe("handleConnectWebhookEvent — autopay bank debit settlement", () => {
    it("records the payment once a SEPA/ACH autopay PaymentIntent settles, using its id for dedup", async () => {
      await service.handleConnectWebhookEvent({
        id: "evt_pi",
        type: "payment_intent.succeeded",
        account: ACCOUNT_A,
        data: {
          object: {
            id: "pi_test_abc",
            amount: 15000,
            metadata: { kind: "autopay", companyId: COMPANY_A, invoiceId: "inv-1", method: "bank_transfer" },
          },
        },
      } as never);

      expect(invoices.recordPayment).toHaveBeenCalledWith(COMPANY_A, actor, "inv-1", { amount: 150, method: "bank_transfer" }, "pi_test_abc");
    });

    it("ignores an autopay PaymentIntent on another company's account", async () => {
      await service.handleConnectWebhookEvent({
        id: "evt_pi",
        type: "payment_intent.succeeded",
        account: ACCOUNT_B,
        data: { object: { id: "pi_forged", amount: 15000, metadata: { kind: "autopay", companyId: COMPANY_A, invoiceId: "inv-1" } } },
      } as never);

      expect(invoices.recordPayment).not.toHaveBeenCalled();
    });

    it("does not record a payment when the autopay bank debit fails", async () => {
      await service.handleConnectWebhookEvent({
        id: "evt_pi",
        type: "payment_intent.payment_failed",
        account: ACCOUNT_A,
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
      await service.handleConnectWebhookEvent({
        id: "evt_pi",
        type: "payment_intent.succeeded",
        account: ACCOUNT_A,
        data: {
          object: { id: "pi_unrelated", amount: 5000, metadata: {} },
        },
      } as never);

      expect(invoices.recordPayment).not.toHaveBeenCalled();
    });
  });
});
