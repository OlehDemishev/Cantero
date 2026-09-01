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
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripeCustomerId: "cus_existing", email: null, name: "Acme" });
      stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/setup" });

      await service.createSetupSession(COMPANY_A, "client-1");

      expect(stripe.customers.create).not.toHaveBeenCalled();
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "setup", customer: "cus_existing" }),
      );
    });

    it("creates a Stripe customer on first use and persists it", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripeCustomerId: null, email: "c@x.com", name: "Acme" });
      stripe.customers.create.mockResolvedValue({ id: "cus_new" });
      stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/setup" });

      await service.createSetupSession(COMPANY_A, "client-1");

      expect(prisma.client.update).toHaveBeenCalledWith({ where: { id: "client-1" }, data: { stripeCustomerId: "cus_new" } });
    });
  });

  describe("removePaymentMethod()", () => {
    it("detaches the card, clears the client's saved fields, and turns off autopay wherever it relied on this card", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripePaymentMethodId: "pm_123" });

      await service.removePaymentMethod(COMPANY_A, "client-1");

      expect(stripe.paymentMethods.detach).toHaveBeenCalledWith("pm_123");
      expect(prisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { stripePaymentMethodId: null, stripePaymentMethodBrand: null, stripePaymentMethodLast4: null },
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
    it("returns succeeded: false without calling Stripe when the client has no saved card", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripeCustomerId: null, stripePaymentMethodId: null });

      const result = await service.chargeOffSession(COMPANY_A, "client-1", 100, "EUR");

      expect(result).toEqual({ succeeded: false, error: "No saved payment method" });
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it("charges the saved card off-session and reports success", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripeCustomerId: "cus_1", stripePaymentMethodId: "pm_1" });
      stripe.paymentIntents.create.mockResolvedValue({ id: "pi_1", status: "succeeded" });

      const result = await service.chargeOffSession(COMPANY_A, "client-1", 99.5, "EUR");

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 9950, currency: "eur", customer: "cus_1", payment_method: "pm_1", off_session: true, confirm: true }),
      );
      expect(result).toEqual({ succeeded: true });
    });

    it("catches a Stripe decline and returns succeeded: false instead of throwing", async () => {
      prisma.client.findFirstOrThrow.mockResolvedValue({ id: "client-1", stripeCustomerId: "cus_1", stripePaymentMethodId: "pm_1" });
      stripe.paymentIntents.create.mockRejectedValue(new Error("Your card was declined."));

      const result = await service.chargeOffSession(COMPANY_A, "client-1", 100, "EUR");

      expect(result.succeeded).toBe(false);
      expect(result.error).toContain("declined");
    });
  });

  describe("handleSetupSessionCompleted()", () => {
    it("saves the payment method id, brand, and last4 from the completed setup session", async () => {
      stripe.setupIntents.retrieve.mockResolvedValue({ payment_method: "pm_new" });
      stripe.paymentMethods.retrieve.mockResolvedValue({ card: { brand: "visa", last4: "4242" } });

      await service.handleSetupSessionCompleted({
        metadata: { clientId: "client-1" },
        setup_intent: "seti_1",
      } as never);

      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: "client-1" },
        data: { stripePaymentMethodId: "pm_new", stripePaymentMethodBrand: "visa", stripePaymentMethodLast4: "4242" },
      });
    });

    it("does nothing when the session has no clientId in metadata", async () => {
      await service.handleSetupSessionCompleted({ metadata: {}, setup_intent: "seti_1" } as never);
      expect(prisma.client.update).not.toHaveBeenCalled();
    });
  });
});
