import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { promises as dnsPromises } from "node:dns";
import { CompanyService } from "./company.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { ExchangeRateService } from "../common/exchange-rate/exchange-rate.service";

jest.mock("node:dns", () => ({ promises: { resolveCname: jest.fn() } }));
const dns = dnsPromises as unknown as { resolveCname: jest.Mock };

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Owner" };

describe("CompanyService — referral program", () => {
  let service: CompanyService;
  let prisma: {
    company: { findUniqueOrThrow: jest.Mock; update: jest.Mock; count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      company: { findUniqueOrThrow: jest.fn(), update: jest.fn(), count: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        CompanyService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: {} },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: MailService, useValue: {} },
        { provide: ExchangeRateService, useValue: {} },
      ],
    }).compile();

    service = module.get(CompanyService);
  });

  describe("get()", () => {
    it("returns the company as-is when it already has a referralCode", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, referralCode: "existing" });

      const result = await service.get(COMPANY_A);

      expect(result.referralCode).toBe("existing");
      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it("backfills a referralCode for a company that predates the referral program", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, referralCode: null });
      prisma.company.update.mockResolvedValue({ id: COMPANY_A, referralCode: "backfilled" });

      const result = await service.get(COMPANY_A);

      expect(prisma.company.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: COMPANY_A }, data: expect.objectContaining({ referralCode: expect.any(String) }) }),
      );
      expect(result.referralCode).toBe("backfilled");
    });
  });

  describe("referralStats()", () => {
    it("counts companies referred by this one", async () => {
      prisma.company.count.mockResolvedValue(3);

      const result = await service.referralStats(COMPANY_A);

      expect(prisma.company.count).toHaveBeenCalledWith({ where: { referredByCompanyId: COMPANY_A } });
      expect(result).toEqual({ referredCount: 3 });
    });
  });
});

describe("CompanyService — custom portal domain", () => {
  let service: CompanyService;
  let prisma: {
    company: { findUniqueOrThrow: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      company: { findUniqueOrThrow: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    };
    audit = { record: jest.fn() };
    dns.resolveCname.mockReset();

    const module = await Test.createTestingModule({
      providers: [
        CompanyService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: {} },
        { provide: AuditService, useValue: audit },
        { provide: MailService, useValue: {} },
        { provide: ExchangeRateService, useValue: {} },
      ],
    }).compile();

    service = module.get(CompanyService);
  });

  describe("setCustomPortalDomain()", () => {
    it("resets verification whenever the domain string is changed", async () => {
      prisma.company.update.mockResolvedValue({ customPortalDomain: "portal.acme.com", customPortalDomainVerifiedAt: null });

      await service.setCustomPortalDomain(COMPANY_A, ACTOR, { domain: "portal.acme.com" });

      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: COMPANY_A },
        data: { customPortalDomain: "portal.acme.com", customPortalDomainVerifiedAt: null },
      });
    });

    it("rejects a domain already registered to another company", async () => {
      prisma.company.update.mockRejectedValue({ code: "P2002" });

      await expect(service.setCustomPortalDomain(COMPANY_A, ACTOR, { domain: "portal.taken.com" })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("verifyCustomPortalDomain()", () => {
    it("rejects when no domain has been set yet", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ customPortalDomain: null });

      await expect(service.verifyCustomPortalDomain(COMPANY_A, ACTOR)).rejects.toThrow(BadRequestException);
    });

    it("marks verified when the CNAME resolves to the expected target", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ customPortalDomain: "portal.acme.com" });
      dns.resolveCname.mockResolvedValue(["portal.cantero.dev"]);
      prisma.company.update.mockResolvedValue({ customPortalDomainVerifiedAt: new Date("2026-09-02T00:00:00.000Z") });

      const result = await service.verifyCustomPortalDomain(COMPANY_A, ACTOR);

      expect(result.verified).toBe(true);
      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: COMPANY_A },
        data: { customPortalDomainVerifiedAt: expect.any(Date) },
      });
      expect(audit.record).toHaveBeenCalled();
    });

    it("reports not verified when the CNAME points somewhere else, without throwing", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ customPortalDomain: "portal.acme.com" });
      dns.resolveCname.mockResolvedValue(["somewhere-else.example.com"]);

      const result = await service.verifyCustomPortalDomain(COMPANY_A, ACTOR);

      expect(result.verified).toBe(false);
      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it("reports not verified (not an error) when the domain has no CNAME record at all yet", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ customPortalDomain: "portal.acme.com" });
      dns.resolveCname.mockRejectedValue(new Error("ENOTFOUND"));

      const result = await service.verifyCustomPortalDomain(COMPANY_A, ACTOR);

      expect(result.verified).toBe(false);
    });
  });

  describe("getPortalBrandingForDomain()", () => {
    it("returns null for a domain that isn't registered and verified", async () => {
      prisma.company.findFirst.mockResolvedValue(null);

      const result = await service.getPortalBrandingForDomain("unknown.example.com");

      expect(result).toBeNull();
    });

    it("only matches a domain that has actually been verified", async () => {
      prisma.company.findFirst.mockResolvedValue(null);

      await service.getPortalBrandingForDomain("portal.acme.com");

      expect(prisma.company.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { customPortalDomain: "portal.acme.com", customPortalDomainVerifiedAt: { not: null } } }),
      );
    });
  });
});
