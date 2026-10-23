import { createHash } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { SsoService } from "./sso.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { SessionsService } from "../common/sessions/sessions.service";
import { promises as dnsPromises } from "node:dns";

jest.mock("node:dns", () => ({ promises: { resolveTxt: jest.fn() } }));
const dns = dnsPromises as unknown as { resolveTxt: jest.Mock };

const validatePostResponseAsync = jest.fn();
const getAuthorizeUrlAsync = jest.fn();
const generateServiceProviderMetadata = jest.fn().mockReturnValue("<EntityDescriptor />");

jest.mock("@node-saml/node-saml", () => ({
  SAML: jest.fn().mockImplementation(() => ({
    validatePostResponseAsync,
    getAuthorizeUrlAsync,
    generateServiceProviderMetadata,
  })),
}));

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Owner" };
const NONCE = "n".repeat(43);
const sha256 = (raw: string) => createHash("sha256").update(raw).digest("hex");

describe("SsoService", () => {
  let service: SsoService;
  let prisma: {
    samlConsumedAssertion: { deleteMany: jest.Mock; create: jest.Mock };
    company: { update: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock; findUniqueOrThrow: jest.Mock };
    user: { findUnique: jest.Mock; create: jest.Mock };
    ssoLoginCode: { deleteMany: jest.Mock; create: jest.Mock; findUnique: jest.Mock };
    membership: { findUnique: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let jwt: { sign: jest.Mock };
  let sessions: { create: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      company: { update: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn().mockResolvedValue({}) },
      user: { findUnique: jest.fn(), create: jest.fn() },
      samlConsumedAssertion: { deleteMany: jest.fn(), create: jest.fn() },
      ssoLoginCode: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }), create: jest.fn(), findUnique: jest.fn() },
      membership: { findUnique: jest.fn() },
    };
    audit = { record: jest.fn() };
    jwt = { sign: jest.fn().mockReturnValue("signed-jwt") };
    sessions = { create: jest.fn().mockResolvedValue("session-1") };

    const module = await Test.createTestingModule({
      providers: [
        SsoService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: JwtService, useValue: jwt },
        { provide: SessionsService, useValue: sessions },
      ],
    }).compile();

    service = module.get(SsoService);
  });

  const CONFIG_INPUT = { domain: "Acme.com", entryPoint: "https://idp.example/sso", issuer: "idp-issuer", cert: "x".repeat(60) };

  describe("updateConfig()", () => {
    it("refuses a domain another company has already verified", async () => {
      prisma.company.findFirst.mockResolvedValue({ id: "company-b" });

      await expect(service.updateConfig(COMPANY_A, ACTOR, CONFIG_INPUT)).rejects.toThrow(BadRequestException);
      expect(prisma.company.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ssoVerifiedDomain: "acme.com", id: { not: COMPANY_A } } }),
      );
      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it("starts a new domain unverified with a fresh verification token", async () => {
      prisma.company.findFirst.mockResolvedValue(null);
      prisma.company.findUniqueOrThrow.mockResolvedValue({ ssoDomain: "old.com", ssoVerifiedDomain: "old.com", ssoDomainVerificationToken: "old" });

      await service.updateConfig(COMPANY_A, ACTOR, CONFIG_INPUT);

      const data = prisma.company.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ ssoDomain: "acme.com", ssoVerifiedDomain: null, ssoDomainVerifiedAt: null });
      expect(data.ssoDomainVerificationToken).toEqual(expect.any(String));
      expect(data.ssoDomainVerificationToken).not.toBe("old");
    });

    it("keeps verification when only the IdP settings change", async () => {
      prisma.company.findFirst.mockResolvedValue(null);
      prisma.company.findUniqueOrThrow.mockResolvedValue({ ssoDomain: "acme.com", ssoVerifiedDomain: "acme.com", ssoDomainVerificationToken: "tok" });

      await service.updateConfig(COMPANY_A, ACTOR, CONFIG_INPUT);

      const data = prisma.company.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty("ssoVerifiedDomain");
      expect(data).not.toHaveProperty("ssoDomainVerificationToken");
    });

    it("maps a unique-constraint race to a clear error", async () => {
      prisma.company.findFirst.mockResolvedValue(null);
      prisma.company.update.mockRejectedValue({ code: "P2002" });

      await expect(service.updateConfig(COMPANY_A, ACTOR, CONFIG_INPUT)).rejects.toThrow(BadRequestException);
    });
  });

  describe("getConfig()", () => {
    it("shows the TXT record to publish while the domain is unverified", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ ssoDomain: "acme.com", ssoVerifiedDomain: null, ssoDomainVerificationToken: "tok" });

      const config = await service.getConfig(COMPANY_A);

      expect(config.ssoDomainVerified).toBe(false);
      expect(config.verificationRecord).toEqual({ type: "TXT", name: "_cantero-sso.acme.com", value: "cantero-sso-verification=tok" });
    });

    it("hides the record once verified", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ ssoDomain: "acme.com", ssoVerifiedDomain: "acme.com", ssoDomainVerificationToken: "tok" });

      const config = await service.getConfig(COMPANY_A);

      expect(config.ssoDomainVerified).toBe(true);
      expect(config.verificationRecord).toBeNull();
    });
  });

  describe("verifyDomain()", () => {
    const unverified = { ssoDomain: "acme.com", ssoVerifiedDomain: null, ssoDomainVerificationToken: "tok" };

    beforeEach(() => dns.resolveTxt.mockReset());

    it("marks the domain verified when the TXT record holds this company's token", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue(unverified);
      prisma.company.findFirst.mockResolvedValue(null);
      dns.resolveTxt.mockResolvedValue([["v=spf1 -all"], ["cantero-sso-", "verification=tok"]]);

      const result = await service.verifyDomain(COMPANY_A, ACTOR);

      expect(dns.resolveTxt).toHaveBeenCalledWith("_cantero-sso.acme.com");
      expect(result.verified).toBe(true);
      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: COMPANY_A },
        data: { ssoVerifiedDomain: "acme.com", ssoDomainVerifiedAt: expect.any(Date) },
      });
    });

    it("stays unverified when the record holds another token", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue(unverified);
      dns.resolveTxt.mockResolvedValue([["cantero-sso-verification=someone-else"]]);

      const result = await service.verifyDomain(COMPANY_A, ACTOR);

      expect(result.verified).toBe(false);
      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it("stays unverified when the lookup fails", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue(unverified);
      dns.resolveTxt.mockRejectedValue(new Error("ENOTFOUND"));

      const result = await service.verifyDomain(COMPANY_A, ACTOR);

      expect(result.verified).toBe(false);
      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it("refuses when another company verified the domain first", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue(unverified);
      prisma.company.findFirst.mockResolvedValue({ id: "company-b" });
      dns.resolveTxt.mockResolvedValue([["cantero-sso-verification=tok"]]);

      await expect(service.verifyDomain(COMPANY_A, ACTOR)).rejects.toThrow(BadRequestException);
      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it("needs a saved domain", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ ssoDomain: null, ssoDomainVerificationToken: null });

      await expect(service.verifyDomain(COMPANY_A, ACTOR)).rejects.toThrow(BadRequestException);
    });
  });

  describe("disable()", () => {
    it("clears the IdP settings and the domain's verification", async () => {
      prisma.company.update.mockResolvedValue({});

      await service.disable(COMPANY_A, ACTOR);

      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: COMPANY_A },
        data: {
          ssoDomain: null,
          ssoEntryPoint: null,
          ssoIssuer: null,
          ssoCert: null,
          ssoDomainVerificationToken: null,
          ssoDomainVerifiedAt: null,
          ssoVerifiedDomain: null,
        },
      });
    });
  });

  describe("startLogin()", () => {
    it("rejects when no company has SSO configured for the email's domain", async () => {
      prisma.company.findFirst.mockResolvedValue(null);

      await expect(service.startLogin("user@unknown.com", NONCE)).rejects.toThrow(NotFoundException);
    });

    it("routes only through a verified domain", async () => {
      prisma.company.findFirst.mockResolvedValue(null);

      await expect(service.startLogin("user@acme.com", NONCE)).rejects.toThrow(NotFoundException);
      expect(prisma.company.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ ssoVerifiedDomain: "acme.com" }) });
    });

    it("builds an IdP redirect URL for a domain with SSO configured", async () => {
      prisma.company.findFirst.mockResolvedValue({
        id: COMPANY_A,
        ssoEntryPoint: "https://idp.example/sso",
        ssoIssuer: "idp-issuer",
        ssoCert: "cert",
      });
      getAuthorizeUrlAsync.mockResolvedValue("https://idp.example/sso?SAMLRequest=...");

      const result = await service.startLogin("user@acme.com", NONCE);

      expect(result.redirectUrl).toBe("https://idp.example/sso?SAMLRequest=...");
      expect(getAuthorizeUrlAsync).toHaveBeenCalledWith(NONCE, undefined, {});
    });
  });

  describe("handleAcs()", () => {
    /** What node-saml's validated profile carries: the email plus the verified assertion XML. */
    const profileFor = (email: string, assertionId = "_a1", notOnOrAfter = "2099-01-01T00:00:00Z") => ({
      nameID: email,
      email,
      getAssertionXml: () =>
        `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${assertionId}" Version="2.0"><saml:Conditions NotBefore="2020-01-01T00:00:00Z" NotOnOrAfter="${notOnOrAfter}"/></saml:Assertion>`,
    });
    const configuredCompany = { id: COMPANY_A, ssoDomain: "acme.com", ssoVerifiedDomain: "acme.com", ssoEntryPoint: "https://idp.example/sso", ssoIssuer: "idp-issuer", ssoCert: "cert" };

    it("rejects when SSO isn't configured for the company", async () => {
      prisma.company.findUnique.mockResolvedValue({ id: COMPANY_A, ssoEntryPoint: null });

      await expect(service.handleAcs(COMPANY_A, "response", NONCE)).rejects.toThrow(NotFoundException);
    });

    it("neither signs in nor provisions while the domain is unverified", async () => {
      prisma.company.findUnique.mockResolvedValue({ ...configuredCompany, ssoVerifiedDomain: null });
      validatePostResponseAsync.mockResolvedValue({ profile: profileFor("newuser@acme.com") });

      await expect(service.handleAcs(COMPANY_A, "response", NONCE)).rejects.toThrow(NotFoundException);
      expect(validatePostResponseAsync).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("rejects an assertion whose email domain doesn't match the company's configured SSO domain", async () => {
      prisma.company.findUnique.mockResolvedValue(configuredCompany);
      validatePostResponseAsync.mockResolvedValue({ profile: profileFor("user@other.com") });

      await expect(service.handleAcs(COMPANY_A, "response", NONCE)).rejects.toThrow(BadRequestException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("rejects when the email already belongs to a user with no membership in this company", async () => {
      prisma.company.findUnique.mockResolvedValue(configuredCompany);
      validatePostResponseAsync.mockResolvedValue({ profile: profileFor("user@acme.com") });
      prisma.user.findUnique.mockResolvedValue({ id: "existing-user", email: "user@acme.com", memberships: [] });

      await expect(service.handleAcs(COMPANY_A, "response", NONCE)).rejects.toThrow(BadRequestException);
    });

    it("just-in-time provisions a new user as worker on first sign-in", async () => {
      prisma.company.findUnique.mockResolvedValue(configuredCompany);
      validatePostResponseAsync.mockResolvedValue({ profile: profileFor("newuser@acme.com") });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: "new-user",
        email: "newuser@acme.com",
        name: "newuser@acme.com",
        memberships: [{ role: "worker" }],
      });

      const result = await service.handleAcs(COMPANY_A, "response", NONCE);

      expect(result.code).toEqual(expect.any(String));
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "newuser@acme.com",
            memberships: { create: { companyId: COMPANY_A, role: "worker" } },
          }),
        }),
      );
    });

    it("reuses an existing membership without re-provisioning on a returning sign-in", async () => {
      prisma.company.findUnique.mockResolvedValue(configuredCompany);
      validatePostResponseAsync.mockResolvedValue({ profile: profileFor("returning@acme.com") });
      prisma.user.findUnique.mockResolvedValue({
        id: "returning-user",
        email: "returning@acme.com",
        name: "Returning User",
        memberships: [{ role: "admin" }],
      });

      const result = await service.handleAcs(COMPANY_A, "response", NONCE);

      expect(result.code).toEqual(expect.any(String));
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("records the assertion ID until it expires", async () => {
      prisma.company.findUnique.mockResolvedValue(configuredCompany);
      validatePostResponseAsync.mockResolvedValue({ profile: profileFor("returning@acme.com", "_abc", "2099-01-01T00:00:00Z") });
      prisma.user.findUnique.mockResolvedValue({ id: "u", email: "returning@acme.com", name: "R", memberships: [{ role: "admin" }] });

      await service.handleAcs(COMPANY_A, "response", NONCE);

      expect(prisma.samlConsumedAssertion.create).toHaveBeenCalledWith({
        data: { companyId: COMPANY_A, assertionId: "_abc", expiresAt: new Date("2099-01-01T00:00:00Z") },
      });
    });

    it("refuses a replayed assertion without issuing a session", async () => {
      prisma.company.findUnique.mockResolvedValue(configuredCompany);
      validatePostResponseAsync.mockResolvedValue({ profile: profileFor("returning@acme.com") });
      prisma.samlConsumedAssertion.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));

      await expect(service.handleAcs(COMPANY_A, "response", NONCE)).rejects.toThrow(/already used/);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("refuses an assertion with no ID rather than skipping the replay check", async () => {
      prisma.company.findUnique.mockResolvedValue(configuredCompany);
      validatePostResponseAsync.mockResolvedValue({ profile: { nameID: "returning@acme.com", email: "returning@acme.com", getAssertionXml: () => "<Assertion/>" } });

      await expect(service.handleAcs(COMPANY_A, "response", NONCE)).rejects.toThrow(/no ID/);
      expect(prisma.samlConsumedAssertion.create).not.toHaveBeenCalled();
    });

    it("hands back a one-time code bound to the nonce instead of a token, storing only hashes", async () => {
      prisma.company.findUnique.mockResolvedValue(configuredCompany);
      validatePostResponseAsync.mockResolvedValue({ profile: profileFor("returning@acme.com") });
      prisma.user.findUnique.mockResolvedValue({ id: "u", email: "returning@acme.com", name: "R", memberships: [{ role: "admin" }] });

      const { code } = await service.handleAcs(COMPANY_A, "response", NONCE);

      expect(code.length).toBeGreaterThanOrEqual(40);
      expect(jwt.sign).not.toHaveBeenCalled();
      expect(sessions.create).not.toHaveBeenCalled();
      const { data } = prisma.ssoLoginCode.create.mock.calls[0][0];
      expect(data).toEqual({ codeHash: sha256(code), nonceHash: sha256(NONCE), userId: "u", companyId: COMPANY_A, expiresAt: expect.any(Date) });
      expect(data.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60_000);
    });

    it.each([undefined, "", "short"])("refuses an assertion without the login page's nonce in RelayState (%p)", async (relayState) => {
      await expect(service.handleAcs(COMPANY_A, "response", relayState)).rejects.toThrow(/login page/);
      expect(validatePostResponseAsync).not.toHaveBeenCalled();
    });

    it("doesn't record anything for an assertion that fails the domain check", async () => {
      prisma.company.findUnique.mockResolvedValue(configuredCompany);
      validatePostResponseAsync.mockResolvedValue({ profile: profileFor("user@other.com") });

      await expect(service.handleAcs(COMPANY_A, "response", NONCE)).rejects.toThrow(BadRequestException);
      expect(prisma.samlConsumedAssertion.create).not.toHaveBeenCalled();
    });
  });

  describe("exchangeCode()", () => {
    const META = { userAgent: "Chrome", ipAddress: "1.2.3.4" };
    const record = (overrides: Record<string, unknown> = {}) => ({
      id: "code-1",
      codeHash: sha256("the-code"),
      nonceHash: sha256(NONCE),
      userId: "user-1",
      companyId: COMPANY_A,
      expiresAt: new Date(Date.now() + 30_000),
      ...overrides,
    });

    it("issues an access token for the code's user and deletes the code", async () => {
      prisma.ssoLoginCode.findUnique.mockResolvedValue(record());
      prisma.membership.findUnique.mockResolvedValue({ role: "admin", customRole: null, user: { email: "a@acme.com", name: "A" } });

      await expect(service.exchangeCode("the-code", NONCE, META)).resolves.toEqual({ accessToken: "signed-jwt" });

      expect(prisma.ssoLoginCode.findUnique).toHaveBeenCalledWith({ where: { codeHash: sha256("the-code") } });
      expect(prisma.ssoLoginCode.deleteMany).toHaveBeenCalledWith({ where: { id: "code-1" } });
      expect(sessions.create).toHaveBeenCalledWith("user-1", COMPANY_A, META);
      expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", companyId: COMPANY_A, role: "admin", sid: "session-1" }));
    });

    it("refuses an unknown code", async () => {
      prisma.ssoLoginCode.findUnique.mockResolvedValue(null);
      await expect(service.exchangeCode("nope", NONCE, META)).rejects.toThrow(BadRequestException);
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it("refuses a code another request already redeemed", async () => {
      prisma.ssoLoginCode.findUnique.mockResolvedValue(record());
      prisma.ssoLoginCode.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.exchangeCode("the-code", NONCE, META)).rejects.toThrow(/already used/);
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it("refuses an expired code", async () => {
      prisma.ssoLoginCode.findUnique.mockResolvedValue(record({ expiresAt: new Date(Date.now() - 1) }));
      await expect(service.exchangeCode("the-code", NONCE, META)).rejects.toThrow(BadRequestException);
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it("refuses a code presented with another browser's nonce, and burns it", async () => {
      prisma.ssoLoginCode.findUnique.mockResolvedValue(record());
      await expect(service.exchangeCode("the-code", "x".repeat(43), META)).rejects.toThrow(/another browser/);
      expect(prisma.ssoLoginCode.deleteMany).toHaveBeenCalledWith({ where: { id: "code-1" } });
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it("refuses when the membership was removed in the meantime", async () => {
      prisma.ssoLoginCode.findUnique.mockResolvedValue(record());
      prisma.membership.findUnique.mockResolvedValue(null);
      await expect(service.exchangeCode("the-code", NONCE, META)).rejects.toThrow(BadRequestException);
      expect(sessions.create).not.toHaveBeenCalled();
    });
  });
});
