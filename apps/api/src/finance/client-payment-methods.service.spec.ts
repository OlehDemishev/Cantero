import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { ClientPaymentMethodsService, hasUsablePaymentMethod } from "./client-payment-methods.service";
import { StripeConnectService } from "./stripe-connect.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";
const ACCOUNT_A = "acct_company_a";

describe("ClientPaymentMethodsService", () => {
  let service: ClientPaymentMethodsService;
  let prisma: {
    client: { findFirstOrThrow: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
    recurringInvoice: { updateMany: jest.Mock };
  };
  let connect: { chargeableAccountFor: jest.Mock };
  let stripe: {
    customers: { create: jest.Mock };
    checkout: { sessions: { create: jest.Mock } };
    paymentMethods: { detach: jest.Mock; retrieve: jest.Mock };
    setupIntents: { retrieve: jest.Mock };
    paymentIntents: { create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      client: { findFirstOrThrow: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ stripeAccountId: ACCOUNT_A, stripeChargesEnabled: true }) },
      recurringInvoice: { updateMany: jest.fn() },
    };
    connect = { chargeableAccountFor: jest.fn().mockResolvedValue(ACCOUNT_A) };

    const config = { getOrThrow: jest.fn().mockReturnValue("sk_test_fake"), get: jest.fn().mockReturnValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        ClientPaymentMethodsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: StripeConnectService, useValue: connect },
      ],
    }).compile();

    service = module.get(ClientPaymentMethodsService);

    stripe = {
      customers: { create: jest.fn() },
      checkout: { sessions: { create: jest.fn() } },
      paymentMethods: { detach: jest.fn(), retrieve: jest.fn() },
      setupIntents: { retrieve: jest.fn() },
      paymentIntents: { create: jest.fn() },
    };
    (service as unknown as { stripe: unknown }).stripe = stripe;
  });

  describe("createSetupSession()", () => {
    it("refuses when the company has no chargeable Stripe account", async () => {
      connect.chargeableAccountFor.mockRejectedValue(new BadRequestException("Online payment isn't set up"));

      await expect(service.createSetupSession(COMPANY_A, "client-1")).rejects.toThrow(BadRequestException);
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it("reuses an existing Stripe customer on the same account instead of creating a duplicate", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({
        id: "client-1",
        stripeCustomerId: "cus_existing",
        stripeAccountId: ACCOUNT_A,
        email: null,
        name: "Acme",
        company: { currency: "GBP" },
      });
      stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/setup" });

      await service.createSetupSession(COMPANY_A, "client-1");

      expect(stripe.customers.create).not.toHaveBeenCalled();
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "setup", customer: "cus_existing" }),
        { stripeAccount: ACCOUNT_A },
      );
    });

    it("creates a Stripe customer on the company's account on first use and persists it", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({
        id: "client-1",
        stripeCustomerId: null,
        stripeAccountId: null,
        email: "c@x.com",
        name: "Acme",
        company: { currency: "GBP" },
      });
      stripe.customers.create.mockResolvedValue({ id: "cus_new" });
      stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/setup" });

      await service.createSetupSession(COMPANY_A, "client-1");

      expect(stripe.customers.create).toHaveBeenCalledWith(expect.anything(), { stripeAccount: ACCOUNT_A });
      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: "client-1" },
        data: expect.objectContaining({ stripeCustomerId: "cus_new", stripeAccountId: ACCOUNT_A }),
      });
    });

    it("starts a fresh customer when the saved one lives on the platform account (before Stripe Connect)", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({
        id: "client-1",
        stripeCustomerId: "cus_platform",
        stripeAccountId: null,
        stripePaymentMethodId: "pm_platform",
        email: null,
        name: "Acme",
        company: { currency: "EUR" },
      });
      stripe.customers.create.mockResolvedValue({ id: "cus_connected" });
      stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/setup" });

      await service.createSetupSession(COMPANY_A, "client-1");

      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: "client-1" },
        data: {
          stripeCustomerId: "cus_connected",
          stripeAccountId: ACCOUNT_A,
          stripePaymentMethodId: null,
          stripePaymentMethodType: null,
          stripePaymentMethodBrand: null,
          stripePaymentMethodLast4: null,
        },
      });
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_connected" }), { stripeAccount: ACCOUNT_A });
    });

    it.each([
      ["GBP", ["card"], "gbp"],
      ["EUR", ["card", "sepa_debit"], "eur"],
      ["USD", ["card", "us_bank_account"], "usd"],
    ])("offers the payment methods that settle in %s", async (currency, types, lower) => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripeCustomerId: "cus_1", stripeAccountId: ACCOUNT_A, email: null, name: "Acme", company: { currency } });
      stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/setup" });

      await service.createSetupSession(COMPANY_A, "client-1");

      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ payment_method_types: types, currency: lower }),
        { stripeAccount: ACCOUNT_A },
      );
    });
  });

  describe("removePaymentMethod()", () => {
    it("detaches the payment method on its own account, clears the client's saved fields, and turns off autopay", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripePaymentMethodId: "pm_123", stripeAccountId: ACCOUNT_A });

      await service.removePaymentMethod(COMPANY_A, "client-1");

      expect(stripe.paymentMethods.detach).toHaveBeenCalledWith("pm_123", {}, { stripeAccount: ACCOUNT_A });
      expect(prisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { stripePaymentMethodId: null, stripePaymentMethodType: null, stripePaymentMethodBrand: null, stripePaymentMethodLast4: null },
        }),
      );
      expect(prisma.recurringInvoice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { autopayEnabled: false } }));
    });

    it("detaches a method saved before Stripe Connect on the platform account", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripePaymentMethodId: "pm_old", stripeAccountId: null });

      await service.removePaymentMethod(COMPANY_A, "client-1");

      expect(stripe.paymentMethods.detach).toHaveBeenCalledWith("pm_old", {}, undefined);
    });

    it("still clears the DB fields even when nothing was ever saved", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripePaymentMethodId: null });

      await service.removePaymentMethod(COMPANY_A, "client-1");

      expect(stripe.paymentMethods.detach).not.toHaveBeenCalled();
      expect(prisma.client.update).toHaveBeenCalled();
    });
  });

  describe("chargeOffSession()", () => {
    const savedCard = { id: "client-1", stripeCustomerId: "cus_1", stripePaymentMethodId: "pm_1", stripePaymentMethodType: "card", stripeAccountId: ACCOUNT_A };

    it("returns status: failed without calling Stripe when the client has no saved payment method", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripeCustomerId: null, stripePaymentMethodId: null, stripeAccountId: null });

      const result = await service.chargeOffSession(COMPANY_A, "client-1", "inv-1", 100, "EUR");

      expect(result.status).toBe("failed");
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it("won't charge a method saved on the platform account before Stripe Connect", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ ...savedCard, stripeAccountId: null });

      const result = await service.chargeOffSession(COMPANY_A, "client-1", "inv-1", 100, "EUR");

      expect(result.status).toBe("failed");
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it("won't charge when the company's Stripe account can't take payments", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue(savedCard);
      prisma.company.findUniqueOrThrow.mockResolvedValue({ stripeAccountId: ACCOUNT_A, stripeChargesEnabled: false });

      const result = await service.chargeOffSession(COMPANY_A, "client-1", "inv-1", 100, "EUR");

      expect(result.status).toBe("failed");
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it("charges the saved card off-session on the company's account, once per invoice, and reports success", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue(savedCard);
      stripe.paymentIntents.create.mockResolvedValue({ id: "pi_1", status: "succeeded" });

      const result = await service.chargeOffSession(COMPANY_A, "client-1", "inv-1", 99.5, "EUR");

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 9950,
          currency: "eur",
          customer: "cus_1",
          payment_method: "pm_1",
          off_session: true,
          confirm: true,
          metadata: { companyId: COMPANY_A, clientId: "client-1", invoiceId: "inv-1", method: "card", kind: "autopay" },
        }),
        { stripeAccount: ACCOUNT_A, idempotencyKey: "autopay-inv-1" },
      );
      expect(result).toEqual({ status: "succeeded", paymentIntentId: "pi_1", method: "card" });
    });

    it("reports processing (not succeeded) for a SEPA/ACH bank debit still clearing", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ ...savedCard, stripePaymentMethodType: "sepa_debit" });
      stripe.paymentIntents.create.mockResolvedValue({ id: "pi_1", status: "processing" });

      const result = await service.chargeOffSession(COMPANY_A, "client-1", "inv-1", 100, "EUR");

      expect(result).toEqual({ status: "processing", paymentIntentId: "pi_1", method: "bank_transfer" });
    });

    it("catches a Stripe decline and returns status: failed instead of throwing", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue(savedCard);
      stripe.paymentIntents.create.mockRejectedValue(new Error("Your card was declined."));

      const result = await service.chargeOffSession(COMPANY_A, "client-1", "inv-1", 100, "EUR");

      expect(result.status).toBe("failed");
      expect(result.error).toContain("declined");
    });
  });

  describe("handleSetupSessionCompleted()", () => {
    const session = { metadata: { clientId: "client-1" }, setup_intent: "seti_1" } as never;

    it.each([
      ["card", { type: "card", card: { brand: "visa", last4: "4242" } }, "visa", "4242"],
      ["SEPA Direct Debit", { type: "sepa_debit", sepa_debit: { last4: "3000" } }, null, "3000"],
      ["US bank account (ACH)", { type: "us_bank_account", us_bank_account: { last4: "6789" } }, null, "6789"],
    ])("saves a %s on the account it was set up on, within the company", async (_label, paymentMethod, brand, last4) => {
      stripe.setupIntents.retrieve.mockResolvedValue({ payment_method: "pm_new" });
      stripe.paymentMethods.retrieve.mockResolvedValue(paymentMethod);

      await service.handleSetupSessionCompleted(session, COMPANY_A, ACCOUNT_A);

      expect(stripe.setupIntents.retrieve).toHaveBeenCalledWith("seti_1", {}, { stripeAccount: ACCOUNT_A });
      expect(prisma.client.updateMany).toHaveBeenCalledWith({
        where: { id: "client-1", companyId: COMPANY_A },
        data: {
          stripeAccountId: ACCOUNT_A,
          stripePaymentMethodId: "pm_new",
          stripePaymentMethodType: paymentMethod.type,
          stripePaymentMethodBrand: brand,
          stripePaymentMethodLast4: last4,
        },
      });
    });

    it("does nothing when the session has no clientId in metadata", async () => {
      await service.handleSetupSessionCompleted({ metadata: {}, setup_intent: "seti_1" } as never, COMPANY_A, ACCOUNT_A);
      expect(prisma.client.updateMany).not.toHaveBeenCalled();
    });
  });
});

describe("hasUsablePaymentMethod", () => {
  const saved = { stripeAccountId: ACCOUNT_A, stripeCustomerId: "cus_1", stripePaymentMethodId: "pm_1" };

  it("is true only for a method saved on the company's current account", () => {
    expect(hasUsablePaymentMethod(saved, ACCOUNT_A)).toBe(true);
    expect(hasUsablePaymentMethod({ ...saved, stripeAccountId: null }, ACCOUNT_A)).toBe(false);
    expect(hasUsablePaymentMethod(saved, "acct_other")).toBe(false);
    expect(hasUsablePaymentMethod(saved, null)).toBe(false);
    expect(hasUsablePaymentMethod({ ...saved, stripePaymentMethodId: null }, ACCOUNT_A)).toBe(false);
  });
});
