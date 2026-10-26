import { BadRequestException, HttpException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { SupplierPortalAuthService } from "./supplier-portal-auth.service";
import { SupplierPortalJwtService } from "./supplier-portal-jwt.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { RateLimiterService } from "../common/rate-limiter/rate-limiter.service";

describe("SupplierPortalAuthService", () => {
  let service: SupplierPortalAuthService;
  let prisma: {
    supplier: { findMany: jest.Mock; updateMany: jest.Mock };
    supplierPortalLoginToken: { create: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
  };
  let mail: { send: jest.Mock };
  let portalJwt: { sign: jest.Mock };
  let rateLimiter: { consume: jest.Mock };

  beforeEach(async () => {
    prisma = {
      supplier: { findMany: jest.fn(), updateMany: jest.fn() },
      supplierPortalLoginToken: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    };
    mail = { send: jest.fn() };
    portalJwt = { sign: jest.fn().mockReturnValue("signed-jwt") };
    rateLimiter = { consume: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SupplierPortalAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: SupplierPortalJwtService, useValue: portalJwt },
        { provide: RateLimiterService, useValue: rateLimiter },
      ],
    }).compile();

    service = module.get(SupplierPortalAuthService);
  });

  describe("requestLink()", () => {
    it("sends no email and still returns ok when no supplier matches the email", async () => {
      prisma.supplier.findMany.mockResolvedValue([]);

      const result = await service.requestLink("nobody@example.com");

      expect(result).toEqual({ ok: true });
      expect(mail.send).not.toHaveBeenCalled();
    });

    it("emails one magic link per matching supplier (one per company)", async () => {
      prisma.supplier.findMany.mockResolvedValue([
        { id: "supplier-1", companyId: "company-a", email: "jane@example.com", company: { name: "Acme Co" } },
        { id: "supplier-2", companyId: "company-b", email: "jane@example.com", company: { name: "Beta Inc" } },
      ]);

      const result = await service.requestLink("jane@example.com");

      expect(result).toEqual({ ok: true });
      expect(prisma.supplierPortalLoginToken.create).toHaveBeenCalledTimes(2);
      expect(mail.send).toHaveBeenCalledTimes(2);
    });

    it("rate-limits link requests per address and per IP", async () => {
      prisma.supplier.findMany.mockResolvedValue([]);

      await service.requestLink("Jane@Example.com", "198.51.100.7");

      expect(rateLimiter.consume).toHaveBeenCalledWith("portal-link:ip:198.51.100.7", 20, 15 * 60 * 1000);
      expect(rateLimiter.consume).toHaveBeenCalledWith("portal-link:supplier:jane@example.com", 5, 15 * 60 * 1000);
    });

    it("sends nothing once the limit is hit", async () => {
      rateLimiter.consume.mockImplementation(() => {
        throw new HttpException("Too many attempts", 429);
      });

      await expect(service.requestLink("jane@example.com", "198.51.100.7")).rejects.toThrow(HttpException);
      expect(prisma.supplier.findMany).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });
  });

  describe("verify()", () => {
    it("uses the token in one conditional write, refusing a used, expired or unknown one", async () => {
      prisma.supplierPortalLoginToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.verify("bad-token")).rejects.toThrow(BadRequestException);

      expect(prisma.supplierPortalLoginToken.updateMany).toHaveBeenCalledWith({
        where: { token: "bad-token", usedAt: null, expiresAt: { gt: expect.any(Date) } },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.supplierPortalLoginToken.findUnique).not.toHaveBeenCalled();
      expect(portalJwt.sign).not.toHaveBeenCalled();
    });

    it("lets only one of two concurrent verifies through", async () => {
      prisma.supplierPortalLoginToken.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      prisma.supplierPortalLoginToken.findUnique.mockResolvedValue({
        id: "tok-1",
        supplierId: "supplier-1",
        usedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60),
        supplier: { portalTokenVersion: 2, companyId: "company-a", name: "Jane", company: { name: "Acme Co" } },
      });

      const results = await Promise.allSettled([service.verify("good-token"), service.verify("good-token")]);

      expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
      expect(portalJwt.sign).toHaveBeenCalledTimes(1);
    });

    it("issues a portal token once the login token is used", async () => {
      prisma.supplierPortalLoginToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.supplierPortalLoginToken.findUnique.mockResolvedValue({
        id: "tok-1",
        supplierId: "supplier-1",
        usedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60),
        supplier: { portalTokenVersion: 2, companyId: "company-a", name: "Jane", company: { name: "Acme Co" } },
      });

      const result = await service.verify("good-token");

      expect(portalJwt.sign).toHaveBeenCalledWith({ supplierId: "supplier-1", companyId: "company-a", tokenVersion: 2 });
      expect(result).toEqual({ accessToken: "signed-jwt", supplierName: "Jane", companyName: "Acme Co" });
    });
  });

  describe("logout()", () => {
    it("bumps the supplier's portalTokenVersion within its own company, retiring every token issued so far", async () => {
      await expect(service.logout({ supplierId: "supplier-1", companyId: "company-a" })).resolves.toEqual({ ok: true });
      expect(prisma.supplier.updateMany).toHaveBeenCalledWith({
        where: { id: "supplier-1", companyId: "company-a" },
        data: { portalTokenVersion: { increment: 1 } },
      });
    });
  });
});
