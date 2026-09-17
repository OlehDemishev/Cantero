import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { ClientPaymentMethodsService } from "./client-payment-methods.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("ClientPaymentMethodsService", () => {
  let service: ClientPaymentMethodsService;
  let prisma: {
    client: { findFirstOrThrow: jest.Mock; update: jest.Mock };
    recurringInvoice: { updateMany: jest.Mock };
  };
  let stripe: {
    customers: { create: jest.Mock };
    checkout: { sessions: { create: jest.Mock } };
    paymentMethods: { detach: jest.Mock; retrieve: jest.Mock };
    setupIntents: { retrieve: jest.Mock };
    paymentIntents: { create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      client: { findFirstOrThrow: jest.fn(), update: jest.fn() },
      recurringInvoice: { updateMany: jest.fn() },
    };

    const config = { getOrThrow: jest.fn().mockReturnValue("sk_test_fake"), get: jest.fn().mockReturnValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        ClientPaymentMethodsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
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
    it("reuses an existing Stripe customer instead of creating a duplicate", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({
        id: "client-1",
        stripeCustomerId: "cus_existing",
        email: null,
        name: "Acme",
        company: { currency: "GBP" },
      });
      stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/setup" });

      await service.createSetupSession(COMPANY_A, "client-1");

      expect(stripe.customers.create).not.toHaveBeenCalled();
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "setup", customer: "cus_existing" }),
      );
    });

    it("creates a Stripe customer on first use and persists it", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({
        id: "client-1",
        stripeCustomerId: null,
        email: "c@x.com",
        name: "Acme",
        company: { currency: "GBP" },
      });
      stripe.customers.create.mockResolvedValue({ id: "cus_new" });
      stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/setup" });

      await service.createSetupSession(COMPANY_A, "client-1");

      expect(prisma.client.update).toHaveBeenCalledWith({ where: { id: "client-1" }, data: { stripeCustomerId: "cus_new" } });
    });

    it("offers only card for a currency with no bank-debit equivalent", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripeCustomerId: "cus_1", email: null, name: "Acme", company: { currency: "GBP" } });
      stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/setup" });

      await service.createSetupSession(COMPANY_A, "client-1");

      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ payment_method_types: ["card"], currency: "gbp" }),
      );
    });

    it("offers card + SEPA Direct Debit for a EUR company", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripeCustomerId: "cus_1", email: null, name: "Acme", company: { currency: "EUR" } });
      stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/setup" });

      await service.createSetupSession(COMPANY_A, "client-1");

      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ payment_method_types: ["card", "sepa_debit"], currency: "eur" }),
      );
    });

    it("offers card + US bank account (ACH) for a USD company", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripeCustomerId: "cus_1", email: null, name: "Acme", company: { currency: "USD" } });
      stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/setup" });

      await service.createSetupSession(COMPANY_A, "client-1");

      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ payment_method_types: ["card", "us_bank_account"], currency: "usd" }),
      );
    });
  });

  describe("removePaymentMethod()", () => {
    it("detaches the payment method, clears the client's saved fields, and turns off autopay wherever it relied on it", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripePaymentMethodId: "pm_123" });

      await service.removePaymentMethod(COMPANY_A, "client-1");

      expect(stripe.paymentMethods.detach).toHaveBeenCalledWith("pm_123");
      expect(prisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { stripePaymentMethodId: null, stripePaymentMethodType: null, stripePaymentMethodBrand: null, stripePaymentMethodLast4: null },
        }),
      );
      expect(prisma.recurringInvoice.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { autopayEnabled: false } }),
      );
    });

    it("still clears the DB fields even when nothing was ever saved", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripePaymentMethodId: null });

      await service.removePaymentMethod(COMPANY_A, "client-1");

      expect(stripe.paymentMethods.detach).not.toHaveBeenCalled();
      expect(prisma.client.update).toHaveBeenCalled();
    });
  });

  describe("chargeOffSession()", () => {
    it("returns status: failed without calling Stripe when the client has no saved payment method", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripeCustomerId: null, stripePaymentMethodId: null });

      const result = await service.chargeOffSession(COMPANY_A, "client-1", "inv-1", 100, "EUR");

      expect(result).toEqual({ status: "failed", error: "No saved payment method" });
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it("charges the saved card off-session and reports success", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripeCustomerId: "cus_1", stripePaymentMethodId: "pm_1", stripePaymentMethodType: "card" });
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
      );
      expect(result).toEqual({ status: "succeeded", paymentIntentId: "pi_1", method: "card" });
    });

    it("reports processing (not succeeded) for a SEPA/ACH bank debit still clearing", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripeCustomerId: "cus_1", stripePaymentMethodId: "pm_1", stripePaymentMethodType: "sepa_debit" });
      stripe.paymentIntents.create.mockResolvedValue({ id: "pi_1", status: "processing" });

      const result = await service.chargeOffSession(COMPANY_A, "client-1", "inv-1", 100, "EUR");

      expect(result).toEqual({ status: "processing", paymentIntentId: "pi_1", method: "bank_transfer" });
    });

    it("catches a Stripe decline and returns status: failed instead of throwing", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripeCustomerId: "cus_1", stripePaymentMethodId: "pm_1", stripePaymentMethodType: "card" });
      stripe.paymentIntents.create.mockRejectedValue(new Error("Your card was declined."));

      const result = await service.chargeOffSession(COMPANY_A, "client-1", "inv-1", 100, "EUR");

      expect(result.status).toBe("failed");
      expect(result.error).toContain("declined");
    });
  });

  describe("handleSetupSessionCompleted()", () => {
    it("saves the payment method id, type, brand, and last4 for a card", async () => {
      stripe.setupIntents.retrieve.mockResolvedValue({ payment_method: "pm_new" });
      stripe.paymentMethods.retrieve.mockResolvedValue({ type: "card", card: { brand: "visa", last4: "4242" } });

      await service.handleSetupSessionCompleted({
        metadata: { clientId: "client-1" },
        setup_intent: "seti_1",
      } as never);

      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: "client-1" },
        data: { stripePaymentMethodId: "pm_new", stripePaymentMethodType: "card", stripePaymentMethodBrand: "visa", stripePaymentMethodLast4: "4242" },
      });
    });

    it("saves a SEPA Direct Debit payment method with no brand", async () => {
      stripe.setupIntents.retrieve.mockResolvedValue({ payment_method: "pm_sepa" });
      stripe.paymentMethods.retrieve.mockResolvedValue({ type: "sepa_debit", sepa_debit: { last4: "3000" } });

      await service.handleSetupSessionCompleted({
        metadata: { clientId: "client-1" },
        setup_intent: "seti_1",
      } as never);

      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: "client-1" },
        data: { stripePaymentMethodId: "pm_sepa", stripePaymentMethodType: "sepa_debit", stripePaymentMethodBrand: null, stripePaymentMethodLast4: "3000" },
      });
    });

    it("saves a US bank account (ACH) payment method with no brand", async () => {
      stripe.setupIntents.retrieve.mockResolvedValue({ payment_method: "pm_ach" });
      stripe.paymentMethods.retrieve.mockResolvedValue({ type: "us_bank_account", us_bank_account: { last4: "6789" } });

      await service.handleSetupSessionCompleted({
        metadata: { clientId: "client-1" },
        setup_intent: "seti_1",
      } as never);

      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: "client-1" },
        data: { stripePaymentMethodId: "pm_ach", stripePaymentMethodType: "us_bank_account", stripePaymentMethodBrand: null, stripePaymentMethodLast4: "6789" },
      });
    });

    it("does nothing when the session has no clientId in metadata", async () => {
      await service.handleSetupSessionCompleted({ metadata: {}, setup_intent: "seti_1" } as never);
      expect(prisma.client.update).not.toHaveBeenCalled();
    });
  });
});
