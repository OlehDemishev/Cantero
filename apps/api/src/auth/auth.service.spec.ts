import { JwtService } from "@nestjs/jwt";
import { HttpException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { AuthService } from "./auth.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { SessionsService } from "../common/sessions/sessions.service";
import { RateLimiterService } from "../common/rate-limiter/rate-limiter.service";

const NO_META = {};

describe("AuthService.login", () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock } };
  let jwt: JwtService;
  let sessions: { create: jest.Mock };
  let rateLimiter: RateLimiterService;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    jwt = new JwtService({ secret: "test-secret" });
    sessions = { create: jest.fn().mockResolvedValue("session-1") };
    rateLimiter = new RateLimiterService();
    service = new AuthService(prisma as never, jwt, sessions as unknown as SessionsService, rateLimiter);
  });

  afterEach(() => {
    rateLimiter.onModuleDestroy();
  });

  it("throws on an unknown email", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.login({ email: "nobody@example.com", password: "x" }, NO_META)).rejects.toThrow(UnauthorizedException);
  });

  it("issues a token with only the base role when no custom role is assigned", async () => {
    const passwordHash = await bcrypt.hash("correct-horse", 12);
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "jane@example.com",
      name: "Jane",
      passwordHash,
      totpEnabledAt: null,
      memberships: [{ companyId: "company-a", role: "worker", customRole: null }],
    });

    const result = await service.login({ email: "jane@example.com", password: "correct-horse" }, NO_META);
    if ("requires2fa" in result) throw new Error("expected a direct login result");
    const decoded = jwt.verify(result.accessToken) as { role: string; additionalRoles?: string[] };

    expect(decoded.role).toBe("worker");
    expect(decoded.additionalRoles).toBeUndefined();
  });

  it("includes the custom role's basePermissions as additionalRoles in the issued token", async () => {
    const passwordHash = await bcrypt.hash("correct-horse", 12);
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "jane@example.com",
      name: "Jane",
      passwordHash,
      totpEnabledAt: null,
      memberships: [
        { companyId: "company-a", role: "worker", customRole: { name: "Site Lead", basePermissions: ["foreman", "estimator"] } },
      ],
    });

    const result = await service.login({ email: "jane@example.com", password: "correct-horse" }, NO_META);
    if ("requires2fa" in result) throw new Error("expected a direct login result");
    const decoded = jwt.verify(result.accessToken) as { role: string; additionalRoles?: string[] };

    expect(decoded.role).toBe("worker");
    expect(decoded.additionalRoles).toEqual(["foreman", "estimator"]);
  });

  it("returns a 2FA challenge instead of a token when the account has 2FA enabled", async () => {
    const passwordHash = await bcrypt.hash("correct-horse", 12);
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "jane@example.com",
      name: "Jane",
      passwordHash,
      totpEnabledAt: new Date(),
      memberships: [{ companyId: "company-a", role: "worker", customRole: null }],
    });

    const result = await service.login({ email: "jane@example.com", password: "correct-horse" }, NO_META);

    expect("requires2fa" in result && result.requires2fa).toBe(true);
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it("throws 429 after too many attempts for the same email, even from different IPs", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    for (let i = 0; i < 8; i++) {
      await expect(service.login({ email: "target@example.com", password: "wrong" }, { ipAddress: `10.0.0.${i}` })).rejects.toThrow(
        UnauthorizedException,
      );
    }

    await expect(service.login({ email: "target@example.com", password: "wrong" }, { ipAddress: "10.0.0.99" })).rejects.toThrow(HttpException);
  });

  it("throws 429 after too many attempts from the same IP, even across different emails", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    for (let i = 0; i < 20; i++) {
      await expect(service.login({ email: `user${i}@example.com`, password: "wrong" }, { ipAddress: "10.0.0.1" })).rejects.toThrow(
        UnauthorizedException,
      );
    }

    await expect(service.login({ email: "yet-another@example.com", password: "wrong" }, { ipAddress: "10.0.0.1" })).rejects.toThrow(HttpException);
  });

  it("does not rate-limit a legitimate user who logs in successfully after a couple of mistakes", async () => {
    // A low bcrypt cost here: this test does 11 sequential compares to exercise the rate
    // limiter, and a realistic cost-12 hash makes that slow enough to flirt with Jest's default
    // timeout — the bcrypt cost itself isn't what's under test.
    const passwordHash = await bcrypt.hash("correct-horse", 4);
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "jane@example.com",
      name: "Jane",
      passwordHash,
      totpEnabledAt: null,
      memberships: [{ companyId: "company-a", role: "worker", customRole: null }],
    });
    const meta = { ipAddress: "10.0.0.1" };

    for (let i = 0; i < 5; i++) {
      await expect(service.login({ email: "jane@example.com", password: "wrong" }, meta)).rejects.toThrow(UnauthorizedException);
    }
    const result = await service.login({ email: "jane@example.com", password: "correct-horse" }, meta);
    if ("requires2fa" in result) throw new Error("expected a direct login result");
    expect(result.accessToken).toBeDefined();

    // A fresh run of mistaken attempts afterwards should count from zero again, not from 5.
    for (let i = 0; i < 5; i++) {
      await expect(service.login({ email: "jane@example.com", password: "wrong" }, meta)).rejects.toThrow(UnauthorizedException);
    }
  });
});

describe("AuthService.signup — referral wiring", () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock };
    plan: { findUnique: jest.Mock };
    company: { create: jest.Mock; findUnique: jest.Mock };
    membership: { create: jest.Mock };
    subscription: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let jwt: JwtService;
  let sessions: { create: jest.Mock };

  const SIGNUP_INPUT = {
    companyName: "New Co",
    name: "Jane",
    email: "jane@example.com",
    password: "correct-horse-battery",
    country: "DE",
    unitSystem: "metric" as const,
    currency: "EUR" as const,
    locale: "en" as const,
    planCode: "starter" as const,
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: "user-new" }) },
      plan: { findUnique: jest.fn().mockResolvedValue({ id: "plan-1", code: "starter" }) },
      company: { create: jest.fn(), findUnique: jest.fn() },
      membership: { create: jest.fn() },
      subscription: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    jwt = new JwtService({ secret: "test-secret" });
    sessions = { create: jest.fn().mockResolvedValue("session-1") };
    service = new AuthService(prisma as never, jwt, sessions as unknown as SessionsService, new RateLimiterService());
  });

  it("generates its own referralCode and leaves referredByCompanyId unset without a referral code", async () => {
    prisma.company.create.mockResolvedValue({ id: "company-new" });
    prisma.membership.create.mockResolvedValue({ role: "owner" });

    await service.signup(SIGNUP_INPUT, {});

    expect(prisma.company.findUnique).not.toHaveBeenCalled();
    const createArgs = prisma.company.create.mock.calls[0][0];
    expect(typeof createArgs.data.referralCode).toBe("string");
    expect(createArgs.data.referralCode.length).toBeGreaterThan(0);
    expect(createArgs.data.referredByCompanyId).toBeUndefined();
  });

  it("looks up and sets referredByCompanyId when a valid referral code is given", async () => {
    prisma.company.findUnique.mockResolvedValue({ id: "referrer-co" });
    prisma.company.create.mockResolvedValue({ id: "company-new" });
    prisma.membership.create.mockResolvedValue({ role: "owner" });

    await service.signup({ ...SIGNUP_INPUT, referralCode: "abc123" }, {});

    expect(prisma.company.findUnique).toHaveBeenCalledWith({ where: { referralCode: "abc123" }, select: { id: true } });
    const createArgs = prisma.company.create.mock.calls[0][0];
    expect(createArgs.data.referredByCompanyId).toBe("referrer-co");
  });

  it("silently ignores an unknown referral code rather than blocking signup", async () => {
    prisma.company.findUnique.mockResolvedValue(null);
    prisma.company.create.mockResolvedValue({ id: "company-new" });
    prisma.membership.create.mockResolvedValue({ role: "owner" });

    await expect(service.signup({ ...SIGNUP_INPUT, referralCode: "nonexistent" }, {})).resolves.toBeDefined();

    const createArgs = prisma.company.create.mock.calls[0][0];
    expect(createArgs.data.referredByCompanyId).toBeUndefined();
  });
});
