import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { SubcontractorPortalAuthService } from "./subcontractor-portal-auth.service";
import { SubcontractorPortalJwtService } from "./subcontractor-portal-jwt.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";

describe("SubcontractorPortalAuthService", () => {
  let service: SubcontractorPortalAuthService;
  let prisma: {
    subcontractor: { findMany: jest.Mock };
    subcontractorPortalLoginToken: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  };
  let mail: { send: jest.Mock };
  let portalJwt: { sign: jest.Mock };

  beforeEach(async () => {
    prisma = {
      subcontractor: { findMany: jest.fn() },
      subcontractorPortalLoginToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    mail = { send: jest.fn() };
    portalJwt = { sign: jest.fn().mockReturnValue("signed-jwt") };

    const module = await Test.createTestingModule({
      providers: [
        SubcontractorPortalAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: SubcontractorPortalJwtService, useValue: portalJwt },
      ],
    }).compile();

    service = module.get(SubcontractorPortalAuthService);
  });

  describe("requestLink()", () => {
    it("sends no email and still returns ok when no subcontractor matches the email", async () => {
      prisma.subcontractor.findMany.mockResolvedValue([]);

      const result = await service.requestLink("nobody@example.com");

      expect(result).toEqual({ ok: true });
      expect(mail.send).not.toHaveBeenCalled();
    });

    it("emails one magic link per matching subcontractor (one per company)", async () => {
      prisma.subcontractor.findMany.mockResolvedValue([
        { id: "sub-1", companyId: "company-a", email: "jane@example.com", company: { name: "Acme Co" } },
        { id: "sub-2", companyId: "company-b", email: "jane@example.com", company: { name: "Beta Inc" } },
      ]);

      const result = await service.requestLink("jane@example.com");

      expect(result).toEqual({ ok: true });
      expect(prisma.subcontractorPortalLoginToken.create).toHaveBeenCalledTimes(2);
      expect(mail.send).toHaveBeenCalledTimes(2);
    });
  });

  describe("verify()", () => {
    it("rejects an unknown token", async () => {
      prisma.subcontractorPortalLoginToken.findUnique.mockResolvedValue(null);
      await expect(service.verify("bad-token")).rejects.toThrow(BadRequestException);
    });

    it("rejects an already-used token", async () => {
      prisma.subcontractorPortalLoginToken.findUnique.mockResolvedValue({
        id: "tok-1",
        subcontractorId: "sub-1",
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60),
        subcontractor: { companyId: "company-a", name: "Jane", company: { name: "Acme Co" } },
      });
      await expect(service.verify("used-token")).rejects.toThrow(BadRequestException);
    });

    it("rejects an expired token", async () => {
      prisma.subcontractorPortalLoginToken.findUnique.mockResolvedValue({
        id: "tok-1",
        subcontractorId: "sub-1",
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        subcontractor: { companyId: "company-a", name: "Jane", company: { name: "Acme Co" } },
      });
      await expect(service.verify("expired-token")).rejects.toThrow(BadRequestException);
    });

    it("issues a portal token and marks the login token used on success", async () => {
      prisma.subcontractorPortalLoginToken.findUnique.mockResolvedValue({
        id: "tok-1",
        subcontractorId: "sub-1",
        usedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60),
        subcontractor: { companyId: "company-a", name: "Jane", company: { name: "Acme Co" } },
      });

      const result = await service.verify("good-token");

      expect(prisma.subcontractorPortalLoginToken.update).toHaveBeenCalledWith({
        where: { id: "tok-1" },
        data: { usedAt: expect.any(Date) },
      });
      expect(portalJwt.sign).toHaveBeenCalledWith({ subcontractorId: "sub-1", companyId: "company-a" });
      expect(result).toEqual({ accessToken: "signed-jwt", subcontractorName: "Jane", companyName: "Acme Co" });
    });
  });
});
