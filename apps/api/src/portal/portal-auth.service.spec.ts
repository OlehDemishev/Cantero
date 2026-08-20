import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PortalAuthService } from "./portal-auth.service";
import { PortalJwtService } from "./portal-jwt.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";

describe("PortalAuthService", () => {
  let service: PortalAuthService;
  let prisma: {
    client: { findMany: jest.Mock };
    clientPortalLoginToken: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  };
  let mail: { send: jest.Mock };
  let portalJwt: { sign: jest.Mock };

  beforeEach(async () => {
    prisma = {
      client: { findMany: jest.fn() },
      clientPortalLoginToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    mail = { send: jest.fn() };
    portalJwt = { sign: jest.fn().mockReturnValue("signed-jwt") };

    const module = await Test.createTestingModule({
      providers: [
        PortalAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PortalJwtService, useValue: portalJwt },
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
  });

  describe("verify()", () => {
    it("rejects an unknown token", async () => {
      prisma.clientPortalLoginToken.findUnique.mockResolvedValue(null);
      await expect(service.verify("bad-token")).rejects.toThrow(BadRequestException);
    });

    it("rejects an already-used token", async () => {
      prisma.clientPortalLoginToken.findUnique.mockResolvedValue({
        id: "tok-1",
        clientId: "client-1",
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60),
        client: { companyId: "company-a", name: "Jane", company: { name: "Acme Co" } },
      });
      await expect(service.verify("used-token")).rejects.toThrow(BadRequestException);
    });

    it("rejects an expired token", async () => {
      prisma.clientPortalLoginToken.findUnique.mockResolvedValue({
        id: "tok-1",
        clientId: "client-1",
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        client: { companyId: "company-a", name: "Jane", company: { name: "Acme Co" } },
      });
      await expect(service.verify("expired-token")).rejects.toThrow(BadRequestException);
    });

    it("issues a portal token and marks the login token used on success", async () => {
      prisma.clientPortalLoginToken.findUnique.mockResolvedValue({
        id: "tok-1",
        clientId: "client-1",
        usedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60),
        client: { companyId: "company-a", name: "Jane", company: { name: "Acme Co" } },
      });

      const result = await service.verify("good-token");

      expect(prisma.clientPortalLoginToken.update).toHaveBeenCalledWith({
        where: { id: "tok-1" },
        data: { usedAt: expect.any(Date) },
      });
      expect(portalJwt.sign).toHaveBeenCalledWith({ clientId: "client-1", companyId: "company-a" });
      expect(result).toEqual({ accessToken: "signed-jwt", clientName: "Jane", companyName: "Acme Co" });
    });
  });
});
