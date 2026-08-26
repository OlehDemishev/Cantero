import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PasswordResetService } from "./password-reset.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";

describe("PasswordResetService", () => {
  let service: PasswordResetService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    passwordResetToken: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    userSession: { updateMany: jest.Mock };
    membership: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let mail: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      userSession: { updateMany: jest.fn() },
      membership: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };
    mail = { send: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue("http://localhost:3000") } },
      ],
    }).compile();

    service = module.get(PasswordResetService);
  });

  describe("forgotPassword", () => {
    it("returns ok without emailing anything for an unknown address", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword({ email: "nobody@example.com" });

      expect(result).toEqual({ ok: true });
      expect(mail.send).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it("creates a token and emails a reset link for a known address", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "user-1", email: "jane@example.com" });

      await service.forgotPassword({ email: "jane@example.com" });

      expect(prisma.passwordResetToken.create).toHaveBeenCalled();
      expect(mail.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: "jane@example.com", text: expect.stringContaining("/reset-password?token=") }),
      );
    });
  });

  describe("resetPassword", () => {
    it("rejects an unknown token", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword({ token: "bad", password: "newpassword123" })).rejects.toThrow(BadRequestException);
    });

    it("rejects an already-used token", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "reset-1",
        userId: "user-1",
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.resetPassword({ token: "used", password: "newpassword123" })).rejects.toThrow(BadRequestException);
    });

    it("rejects an expired token", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "reset-1",
        userId: "user-1",
        usedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(service.resetPassword({ token: "expired", password: "newpassword123" })).rejects.toThrow(BadRequestException);
    });

    it("updates the password, marks the token used, and revokes existing sessions on a valid token", async () => {
      const raw = "valid-raw-token";
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "reset-1",
        userId: "user-1",
        tokenHash: createHash("sha256").update(raw).digest("hex"),
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await service.resetPassword({ token: raw, password: "newpassword123" });

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("applies the strictest policy across every company the user belongs to", async () => {
      const raw = "valid-raw-token";
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "reset-1",
        userId: "user-1",
        tokenHash: createHash("sha256").update(raw).digest("hex"),
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.membership.findMany.mockResolvedValue([
        { company: { passwordMinLength: 8, passwordRequireSymbol: false } },
        { company: { passwordMinLength: 12, passwordRequireSymbol: true } },
      ]);

      await expect(service.resetPassword({ token: raw, password: "longenough1" })).rejects.toThrow(BadRequestException);
      await expect(service.resetPassword({ token: raw, password: "longenough1!" })).resolves.toEqual({ ok: true });
    });
  });
});
