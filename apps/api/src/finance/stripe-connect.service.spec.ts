import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { StripeConnectService } from "./stripe-connect.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("StripeConnectService", () => {
  let service: StripeConnectService;
  let prisma: { company: { findUniqueOrThrow: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock } };
  let stripe: { accounts: { create: jest.Mock; retrieve: jest.Mock }; accountLinks: { create: jest.Mock } };

  beforeEach(async () => {
    prisma = { company: { findUniqueOrThrow: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const config = { getOrThrow: jest.fn().mockReturnValue("sk_test_fake"), get: jest.fn().mockReturnValue("https://app.example.com") };
    const module = await Test.createTestingModule({
      providers: [StripeConnectService, { provide: PrismaService, useValue: prisma }, { provide: ConfigService, useValue: config }],
    }).compile();
    service = module.get(StripeConnectService);
    stripe = {
      accounts: { create: jest.fn(), retrieve: jest.fn() },
      accountLinks: { create: jest.fn().mockResolvedValue({ url: "https://connect.stripe.com/setup/x" }) },
    };
    (service as unknown as { stripe: unknown }).stripe = stripe;
  });

  describe("chargeableAccountFor()", () => {
    it("returns the account when it can take charges", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ stripeAccountId: "acct_1", stripeChargesEnabled: true });
      await expect(service.chargeableAccountFor(COMPANY_A)).resolves.toBe("acct_1");
    });

    it.each([
      ["no account", { stripeAccountId: null, stripeChargesEnabled: false }],
      ["unfinished onboarding", { stripeAccountId: "acct_1", stripeChargesEnabled: false }],
    ])("refuses with %s", async (_label, company) => {
      prisma.company.findUniqueOrThrow.mockResolvedValue(company);
      await expect(service.chargeableAccountFor(COMPANY_A)).rejects.toThrow(BadRequestException);
    });
  });

  describe("createOnboardingLink()", () => {
    it("creates a Standard account once, idempotently, then links to its onboarding", async () => {
      prisma.company.findUniqueOrThrow
        .mockResolvedValueOnce({ name: "Acme Bau", country: "DE", stripeAccountId: null })
        .mockResolvedValueOnce({ stripeAccountId: "acct_new" });
      stripe.accounts.create.mockResolvedValue({ id: "acct_new" });

      const result = await service.createOnboardingLink(COMPANY_A, "owner@acme.de");

      expect(stripe.accounts.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: "standard", country: "DE", metadata: { companyId: COMPANY_A } }),
        { idempotencyKey: `connect-account-${COMPANY_A}` },
      );
      // Only claims the account if no concurrent request already stored one.
      expect(prisma.company.updateMany).toHaveBeenCalledWith({ where: { id: COMPANY_A, stripeAccountId: null }, data: { stripeAccountId: "acct_new" } });
      expect(stripe.accountLinks.create).toHaveBeenCalledWith(expect.objectContaining({ account: "acct_new", type: "account_onboarding" }));
      expect(result).toEqual({ url: "https://connect.stripe.com/setup/x" });
    });

    it("resumes onboarding on the existing account instead of creating another", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ name: "Acme Bau", country: "DE", stripeAccountId: "acct_existing" });

      await service.createOnboardingLink(COMPANY_A, "owner@acme.de");

      expect(stripe.accounts.create).not.toHaveBeenCalled();
      expect(stripe.accountLinks.create).toHaveBeenCalledWith(expect.objectContaining({ account: "acct_existing" }));
    });
  });

  describe("accountBelongsTo()", () => {
    it("matches only the company's own stored account", async () => {
      prisma.company.findUnique.mockResolvedValue({ stripeAccountId: "acct_1" });
      await expect(service.accountBelongsTo("acct_1", COMPANY_A)).resolves.toBe(true);
      await expect(service.accountBelongsTo("acct_2", COMPANY_A)).resolves.toBe(false);
    });

    it("is false for an unknown company", async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      await expect(service.accountBelongsTo("acct_1", "nope")).resolves.toBe(false);
    });
  });

  it("forgets a deauthorized account so nothing is charged there any more", async () => {
    await service.handleDeauthorized("acct_1");
    expect(prisma.company.updateMany).toHaveBeenCalledWith({
      where: { stripeAccountId: "acct_1" },
      data: { stripeAccountId: null, stripeChargesEnabled: false },
    });
  });
});
