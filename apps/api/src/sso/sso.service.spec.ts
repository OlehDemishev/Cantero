import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { SsoService } from "./sso.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

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

describe("SsoService", () => {
  let service: SsoService;
  let prisma: {
    company: { update: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock; findUniqueOrThrow: jest.Mock };
    user: { findUnique: jest.Mock; create: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      company: { update: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn().mockResolvedValue({}) },
      user: { findUnique: jest.fn(), create: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SsoService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue("signed-jwt") } },
      ],
    }).compile();

    service = module.get(SsoService);
  });

  describe("updateConfig()", () => {
    it("surfaces a clear error when the domain is already claimed by another company", async () => {
      prisma.company.update.mockRejectedValue({ code: "P2002" });

      await expect(
        service.updateConfig(COMPANY_A, ACTOR, { domain: "acme.com", entryPoint: "https://idp.example/sso", issuer: "idp-issuer", cert: "x".repeat(60) }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("disable()", () => {
    it("clears all four fields", async () => {
      prisma.company.update.mockResolvedValue({});

      await service.disable(COMPANY_A, ACTOR);

      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: COMPANY_A },
        data: { ssoDomain: null, ssoEntryPoint: null, ssoIssuer: null, ssoCert: null },
      });
    });
  });

  describe("startLogin()", () => {
    it("rejects when no company has SSO configured for the email's domain", async () => {
      prisma.company.findFirst.mockResolvedValue(null);

      await expect(service.startLogin("user@unknown.com")).rejects.toThrow(NotFoundException);
    });

    it("builds an IdP redirect URL for a domain with SSO configured", async () => {
      prisma.company.findFirst.mockResolvedValue({
        id: COMPANY_A,
        ssoEntryPoint: "https://idp.example/sso",
        ssoIssuer: "idp-issuer",
        ssoCert: "cert",
      });
      getAuthorizeUrlAsync.mockResolvedValue("https://idp.example/sso?SAMLRequest=...");

      const result = await service.startLogin("user@acme.com");

      expect(result.redirectUrl).toBe("https://idp.example/sso?SAMLRequest=...");
    });
  });

  describe("handleAcs()", () => {
    const configuredCompany = { id: COMPANY_A, ssoDomain: "acme.com", ssoEntryPoint: "https://idp.example/sso", ssoIssuer: "idp-issuer", ssoCert: "cert" };

    it("rejects when SSO isn't configured for the company", async () => {
      prisma.company.findUnique.mockResolvedValue({ id: COMPANY_A, ssoEntryPoint: null });

      await expect(service.handleAcs(COMPANY_A, "response")).rejects.toThrow(NotFoundException);
    });

    it("rejects an assertion whose email domain doesn't match the company's configured SSO domain", async () => {
      prisma.company.findUnique.mockResolvedValue(configuredCompany);
      validatePostResponseAsync.mockResolvedValue({ profile: { nameID: "user@other.com", email: "user@other.com" } });

      await expect(service.handleAcs(COMPANY_A, "response")).rejects.toThrow(BadRequestException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("rejects when the email already belongs to a user with no membership in this company", async () => {
      prisma.company.findUnique.mockResolvedValue(configuredCompany);
      validatePostResponseAsync.mockResolvedValue({ profile: { nameID: "user@acme.com", email: "user@acme.com" } });
      prisma.user.findUnique.mockResolvedValue({ id: "existing-user", email: "user@acme.com", memberships: [] });

      await expect(service.handleAcs(COMPANY_A, "response")).rejects.toThrow(BadRequestException);
    });

    it("just-in-time provisions a new user as worker on first sign-in", async () => {
      prisma.company.findUnique.mockResolvedValue(configuredCompany);
      validatePostResponseAsync.mockResolvedValue({ profile: { nameID: "newuser@acme.com", email: "newuser@acme.com" } });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: "new-user",
        email: "newuser@acme.com",
        name: "newuser@acme.com",
        memberships: [{ role: "worker" }],
      });

      const result = await service.handleAcs(COMPANY_A, "response");

      expect(result.accessToken).toBe("signed-jwt");
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
      validatePostResponseAsync.mockResolvedValue({ profile: { nameID: "returning@acme.com", email: "returning@acme.com" } });
      prisma.user.findUnique.mockResolvedValue({
        id: "returning-user",
        email: "returning@acme.com",
        name: "Returning User",
        memberships: [{ role: "admin" }],
      });

      const result = await service.handleAcs(COMPANY_A, "response");

      expect(result.accessToken).toBe("signed-jwt");
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });
});
