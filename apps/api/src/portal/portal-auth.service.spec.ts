import { BadRequestException, HttpException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PortalAuthService } from "./portal-auth.service";
import { PortalJwtService } from "./portal-jwt.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { RateLimiterService } from "../common/rate-limiter/rate-limiter.service";

describe("PortalAuthService", () => {
  let service: PortalAuthService;
  let prisma: {
    client: { findMany: jest.Mock; updateMany: jest.Mock };
    clientPortalLoginToken: { create: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
  };
  let mail: { send: jest.Mock };
  let portalJwt: { sign: jest.Mock };
  let rateLimiter: { consume: jest.Mock };

  beforeEach(async () => {
    prisma = {
      client: { findMany: jest.fn(), updateMany: jest.fn() },
      clientPortalLoginToken: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    };
    mail = { send: jest.fn() };
    portalJwt = { sign: jest.fn().mockReturnValue("signed-jwt") };
    rateLimiter = { consume: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        PortalAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PortalJwtService, useValue: portalJwt },
        { provide: RateLimiterService, useValue: rateLimiter },
      ],
    }).compile();

    service = module.get(PortalAuthService);
  });

  describe("requestLink()", () => {
    it("sends no email and still returns ok when no client matches the email", async () => {
      prisma.client.findMany.mockResolvedValue([]);

      const result = await service.requestLink("nobody@example.com");

      expect(result).toEqual({ ok: true });
      expect(mail.send).not.toHaveBeenCalled();
    });

    it("emails one magic link per matching client (one per company)", async () => {
      prisma.client.findMany.mockResolvedValue([
        { id: "client-1", companyId: "company-a", email: "jane@example.com", company: { name: "Acme Co" } },
        { id: "client-2", companyId: "company-b", email: "jane@example.com", company: { name: "Beta Inc" } },
      ]);

      const result = await service.requestLink("jane@example.com");

      expect(result).toEqual({ ok: true });
      expect(prisma.clientPortalLoginToken.create).toHaveBeenCalledTimes(2);
      expect(mail.send).toHaveBeenCalledTimes(2);
    });

    it("rate-limits link requests per address and per IP", async () => {
      prisma.client.findMany.mockResolvedValue([]);

      await service.requestLink("Jane@Example.com", "198.51.100.7");

      expect(rateLimiter.consume).toHaveBeenCalledWith("portal-link:ip:198.51.100.7", 20, 15 * 60 * 1000);
      expect(rateLimiter.consume).toHaveBeenCalledWith("portal-link:client:jane@example.com", 5, 15 * 60 * 1000);
    });

    it("sends nothing once the limit is hit", async () => {
      rateLimiter.consume.mockImplementation(() => {
        throw new HttpException("Too many attempts", 429);
      });

      await expect(service.requestLink("jane@example.com", "198.51.100.7")).rejects.toThrow(HttpException);
      expect(prisma.client.findMany).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });
  });

  describe("verify()", () => {
    it("uses the token in one conditional write, refusing a used, expired or unknown one", async () => {
      prisma.clientPortalLoginToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.verify("bad-token")).rejects.toThrow(BadRequestException);

      expect(prisma.clientPortalLoginToken.updateMany).toHaveBeenCalledWith({
        where: { token: "bad-token", usedAt: null, expiresAt: { gt: expect.any(Date) } },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.clientPortalLoginToken.findUnique).not.toHaveBeenCalled();
      expect(portalJwt.sign).not.toHaveBeenCalled();
    });

    it("lets only one of two concurrent verifies through", async () => {
      prisma.clientPortalLoginToken.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      prisma.clientPortalLoginToken.findUnique.mockResolvedValue({
        id: "tok-1",
        clientId: "client-1",
        usedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60),
        client: { portalTokenVersion: 2, companyId: "company-a", name: "Jane", company: { name: "Acme Co" } },
      });

      const results = await Promise.allSettled([service.verify("good-token"), service.verify("good-token")]);

      expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
      expect(portalJwt.sign).toHaveBeenCalledTimes(1);
    });

    it("issues a portal token once the login token is used", async () => {
      prisma.clientPortalLoginToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.clientPortalLoginToken.findUnique.mockResolvedValue({
        id: "tok-1",
        clientId: "client-1",
        usedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60),
        client: { portalTokenVersion: 2, companyId: "company-a", name: "Jane", company: { name: "Acme Co" } },
      });

      const result = await service.verify("good-token");

      expect(portalJwt.sign).toHaveBeenCalledWith({ clientId: "client-1", companyId: "company-a", tokenVersion: 2 });
      expect(result).toEqual({ accessToken: "signed-jwt", clientName: "Jane", companyName: "Acme Co" });
    });
  });

  describe("logout()", () => {
    it("bumps the client's portalTokenVersion within its own company, retiring every token issued so far", async () => {
      await expect(service.logout({ clientId: "client-1", companyId: "company-a" })).resolves.toEqual({ ok: true });
      expect(prisma.client.updateMany).toHaveBeenCalledWith({
        where: { id: "client-1", companyId: "company-a" },
        data: { portalTokenVersion: { increment: 1 } },
      });
    });
  });
});
