import { BadRequestException, HttpException, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { TwoFactorService } from "./two-factor.service";
import { AuthService } from "./auth.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { RateLimiterService } from "../common/rate-limiter/rate-limiter.service";
import { encrypted } from "../common/crypto/testing";

describe("TwoFactorService", () => {
  let service: TwoFactorService;
  let prisma: {
    user: { update: jest.Mock; findUniqueOrThrow: jest.Mock; findUnique: jest.Mock };
  };
  let jwt: JwtService;
  let authService: { issueAccessToken: jest.Mock };
  let rateLimiter: RateLimiterService;

  beforeEach(async () => {
    prisma = {
      user: { update: jest.fn(), findUniqueOrThrow: jest.fn(), findUnique: jest.fn() },
    };
    jwt = new JwtService({ secret: "test-secret" });
    authService = { issueAccessToken: jest.fn().mockResolvedValue("real-access-token") };
    rateLimiter = new RateLimiterService();

    const module = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: AuthService, useValue: authService },
        { provide: RateLimiterService, useValue: rateLimiter },
      ],
    }).compile();

    service = module.get(TwoFactorService);
  });

  afterEach(() => {
    rateLimiter.onModuleDestroy();
  });

  describe("setup", () => {
    it("generates and stores a secret as pending (not live), returning an otpauth URL, when 2FA isn't active yet", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ totpEnabledAt: null });

      const result = await service.setup("user-1", "jane@example.com");

      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { pendingTotpSecret: encrypted(result.secret) } });
      expect(result.otpauthUrl).toContain("otpauth://totp/");
      expect(result.otpauthUrl).toContain("Cantero");
    });

    it("rejects replacing an already-active authenticator without the current password", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ totpEnabledAt: new Date(), passwordHash: "irrelevant" });

      await expect(service.setup("user-1", "jane@example.com")).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("rejects replacing an already-active authenticator with the wrong password", async () => {
      const passwordHash = await bcrypt.hash("correct", 10);
      prisma.user.findUniqueOrThrow.mockResolvedValue({ totpEnabledAt: new Date(), passwordHash });

      await expect(service.setup("user-1", "jane@example.com", "wrong")).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("allows replacing an already-active authenticator with the correct password, without touching the live secret yet", async () => {
      const passwordHash = await bcrypt.hash("correct", 10);
      prisma.user.findUniqueOrThrow.mockResolvedValue({ totpEnabledAt: new Date(), passwordHash });

      const result = await service.setup("user-1", "jane@example.com", "correct");

      expect(result.otpauthUrl).toContain("otpauth://totp/");
      // The audit scenario this whole pending-secret design closes: re-authenticating and calling
      // setup() again must never itself disable the still-working old authenticator — only
      // enable() (confirming a code from the NEW secret) may do that.
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { pendingTotpSecret: encrypted(result.secret) } });
      expect(prisma.user.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ totpSecret: expect.anything() }) }));
    });
  });

  describe("enable", () => {
    it("rejects when setup hasn't been called", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ pendingTotpSecret: null });

      await expect(service.enable("user-1", "123456")).rejects.toThrow(BadRequestException);
    });

    it("rejects an invalid code", async () => {
      const secret = authenticator.generateSecret();
      prisma.user.findUniqueOrThrow.mockResolvedValue({ pendingTotpSecret: secret });

      await expect(service.enable("user-1", "000000")).rejects.toThrow(BadRequestException);
    });

    it("confirms 2FA with a valid code, promotes the pending secret to live, and returns backup codes", async () => {
      const secret = authenticator.generateSecret();
      prisma.user.findUniqueOrThrow.mockResolvedValue({ pendingTotpSecret: secret });
      const code = authenticator.generate(secret);

      const result = await service.enable("user-1", code);

      expect(result.backupCodes).toHaveLength(8);
      const updateCall = prisma.user.update.mock.calls[0][0];
      expect(updateCall.data.totpSecret).toEqual(encrypted(secret));
      expect(updateCall.data.pendingTotpSecret).toBeNull();
      expect(updateCall.data.totpEnabledAt).toBeInstanceOf(Date);
      expect(updateCall.data.totpBackupCodes).toHaveLength(8);
    });

    it("never touches the live totpSecret when the pending code check fails, so an active authenticator survives an abandoned re-setup", async () => {
      const liveSecret = authenticator.generateSecret();
      const newPendingSecret = authenticator.generateSecret();
      prisma.user.findUniqueOrThrow.mockResolvedValue({ totpSecret: liveSecret, pendingTotpSecret: newPendingSecret });

      await expect(service.enable("user-1", "000000")).rejects.toThrow(BadRequestException);

      expect(prisma.user.update).not.toHaveBeenCalled();
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
        data: { totpSecret: null, pendingTotpSecret: null, totpEnabledAt: null, totpBackupCodes: [] },
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

    it("still accepts a code from the old, live authenticator while a re-setup is pending but unconfirmed", async () => {
      const liveSecret = authenticator.generateSecret();
      const newPendingSecret = authenticator.generateSecret();
      const challengeToken = jwt.sign({ userId: "user-1", kind: "2fa_challenge" }, { expiresIn: "10m" });
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "jane@example.com",
        name: "Jane",
        totpSecret: liveSecret,
        pendingTotpSecret: newPendingSecret,
        totpEnabledAt: new Date(),
        totpBackupCodes: [],
        memberships: [{ companyId: "company-a", role: "worker", customRole: null }],
      });
      const codeFromOldAuthenticator = authenticator.generate(liveSecret);

      const result = await service.verifyChallenge(challengeToken, codeFromOldAuthenticator, {});

      expect("requires2fa" in result).toBe(false);
      expect(authService.issueAccessToken).toHaveBeenCalled();
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

    it("throws 429 after too many wrong codes for the same challenge, even with fresh tokens", async () => {
      const secret = authenticator.generateSecret();
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "jane@example.com",
        name: "Jane",
        totpSecret: secret,
        totpEnabledAt: new Date(),
        totpBackupCodes: [],
        memberships: [{ companyId: "company-a", role: "worker", customRole: null }],
      });

      for (let i = 0; i < 8; i++) {
        const challengeToken = jwt.sign({ userId: "user-1", kind: "2fa_challenge" }, { expiresIn: "10m" });
        await expect(service.verifyChallenge(challengeToken, "000000", {})).rejects.toThrow(UnauthorizedException);
      }

      const oneMoreToken = jwt.sign({ userId: "user-1", kind: "2fa_challenge" }, { expiresIn: "10m" });
      await expect(service.verifyChallenge(oneMoreToken, "000000", {})).rejects.toThrow(HttpException);
    });

    it("does not rate-limit a different account's challenge", async () => {
      const secret = authenticator.generateSecret();
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "jane@example.com",
        name: "Jane",
        totpSecret: secret,
        totpEnabledAt: new Date(),
        totpBackupCodes: [],
        memberships: [{ companyId: "company-a", role: "worker", customRole: null }],
      });
      for (let i = 0; i < 8; i++) {
        const challengeToken = jwt.sign({ userId: "user-1", kind: "2fa_challenge" }, { expiresIn: "10m" });
        await expect(service.verifyChallenge(challengeToken, "000000", {})).rejects.toThrow(UnauthorizedException);
      }

      const otherUserToken = jwt.sign({ userId: "user-2", kind: "2fa_challenge" }, { expiresIn: "10m" });
      await expect(service.verifyChallenge(otherUserToken, "000000", {})).rejects.toThrow(UnauthorizedException);
    });
  });
});
