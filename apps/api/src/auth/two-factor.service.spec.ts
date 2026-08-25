import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { TwoFactorService } from "./two-factor.service";
import { AuthService } from "./auth.service";
import { PrismaService } from "../common/prisma/prisma.service";

describe("TwoFactorService", () => {
  let service: TwoFactorService;
  let prisma: {
    user: { update: jest.Mock; findUniqueOrThrow: jest.Mock; findUnique: jest.Mock };
  };
  let jwt: JwtService;
  let authService: { issueAccessToken: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { update: jest.fn(), findUniqueOrThrow: jest.fn(), findUnique: jest.fn() },
    };
    jwt = new JwtService({ secret: "test-secret" });
    authService = { issueAccessToken: jest.fn().mockResolvedValue("real-access-token") };

    const module = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    service = module.get(TwoFactorService);
  });

  describe("setup", () => {
    it("generates and stores a secret, returning an otpauth URL", async () => {
      const result = await service.setup("user-1", "jane@example.com");

      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { totpSecret: result.secret } });
      expect(result.otpauthUrl).toContain("otpauth://totp/");
      expect(result.otpauthUrl).toContain("Cantero");
    });
  });

  describe("enable", () => {
    it("rejects when setup hasn't been called", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ totpSecret: null });

      await expect(service.enable("user-1", "123456")).rejects.toThrow(BadRequestException);
    });

    it("rejects an invalid code", async () => {
      const secret = authenticator.generateSecret();
      prisma.user.findUniqueOrThrow.mockResolvedValue({ totpSecret: secret });

      await expect(service.enable("user-1", "000000")).rejects.toThrow(BadRequestException);
    });

    it("confirms 2FA with a valid code and returns backup codes", async () => {
      const secret = authenticator.generateSecret();
      prisma.user.findUniqueOrThrow.mockResolvedValue({ totpSecret: secret });
      const code = authenticator.generate(secret);

      const result = await service.enable("user-1", code);

      expect(result.backupCodes).toHaveLength(8);
      const updateCall = prisma.user.update.mock.calls[0][0];
      expect(updateCall.data.totpEnabledAt).toBeInstanceOf(Date);
      expect(updateCall.data.totpBackupCodes).toHaveLength(8);
    });
  });

  describe("disable", () => {
    it("rejects an incorrect password", async () => {
      const passwordHash = await bcrypt.hash("correct", 10);
      prisma.user.findUniqueOrThrow.mockResolvedValue({ passwordHash });

      await expect(service.disable("user-1", "wrong")).rejects.toThrow(UnauthorizedException);
    });

    it("clears 2FA fields on a correct password", async () => {
      const passwordHash = await bcrypt.hash("correct", 10);
      prisma.user.findUniqueOrThrow.mockResolvedValue({ passwordHash });

      await service.disable("user-1", "correct");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { totpSecret: null, totpEnabledAt: null, totpBackupCodes: [] },
      });
    });
  });

  describe("verifyChallenge", () => {
    it("rejects an expired or malformed challenge token", async () => {
      await expect(service.verifyChallenge("garbage", "123456", {})).rejects.toThrow(UnauthorizedException);
    });

    it("rejects a challenge token of the wrong kind", async () => {
      const token = jwt.sign({ userId: "user-1", kind: "not-2fa" });
      await expect(service.verifyChallenge(token, "123456", {})).rejects.toThrow(UnauthorizedException);
    });

    it("issues a real access token for a valid TOTP code", async () => {
      const secret = authenticator.generateSecret();
      const challengeToken = jwt.sign({ userId: "user-1", kind: "2fa_challenge" }, { expiresIn: "10m" });
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "jane@example.com",
        name: "Jane",
        totpSecret: secret,
        totpEnabledAt: new Date(),
        totpBackupCodes: [],
        memberships: [{ companyId: "company-a", role: "worker", customRole: null }],
      });
      const code = authenticator.generate(secret);

      const result = await service.verifyChallenge(challengeToken, code, {});

      expect("requires2fa" in result).toBe(false);
      expect(authService.issueAccessToken).toHaveBeenCalled();
    });

    it("accepts and consumes a valid backup code when the TOTP code is wrong", async () => {
      const secret = authenticator.generateSecret();
      const challengeToken = jwt.sign({ userId: "user-1", kind: "2fa_challenge" }, { expiresIn: "10m" });
      const backupCode = "ABCD1234EF";
      const hashedBackup = await bcrypt.hash(backupCode, 10);
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "jane@example.com",
        name: "Jane",
        totpSecret: secret,
        totpEnabledAt: new Date(),
        totpBackupCodes: [hashedBackup],
        memberships: [{ companyId: "company-a", role: "worker", customRole: null }],
      });

      await service.verifyChallenge(challengeToken, backupCode, {});

      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { totpBackupCodes: [] } });
      expect(authService.issueAccessToken).toHaveBeenCalled();
    });

    it("rejects a code that matches neither TOTP nor a backup code", async () => {
      const secret = authenticator.generateSecret();
      const challengeToken = jwt.sign({ userId: "user-1", kind: "2fa_challenge" }, { expiresIn: "10m" });
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "jane@example.com",
        name: "Jane",
        totpSecret: secret,
        totpEnabledAt: new Date(),
        totpBackupCodes: [],
        memberships: [{ companyId: "company-a", role: "worker", customRole: null }],
      });

      await expect(service.verifyChallenge(challengeToken, "000000", {})).rejects.toThrow(UnauthorizedException);
    });
  });
});
