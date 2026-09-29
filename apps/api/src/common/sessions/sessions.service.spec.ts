import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SessionsService } from "./sessions.service";
import { PrismaService } from "../prisma/prisma.service";

describe("SessionsService", () => {
  let service: SessionsService;
  let prisma: {
    userSession: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    company: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      userSession: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      company: { findUnique: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [SessionsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(SessionsService);
  });

  describe("create", () => {
    it("creates a session row and returns its id", async () => {
      prisma.userSession.create.mockResolvedValue({ id: "session-1" });

      const id = await service.create("user-1", { userAgent: "Chrome", ipAddress: "1.2.3.4" });

      expect(id).toBe("session-1");
      expect(prisma.userSession.create).toHaveBeenCalledWith({
        data: { userId: "user-1", userAgent: "Chrome", ipAddress: "1.2.3.4" },
      });
    });
  });

  describe("isRevoked", () => {
    it("treats a missing session as revoked", async () => {
      prisma.userSession.findUnique.mockResolvedValue(null);
      expect(await service.isRevoked("nope")).toBe(true);
    });

    it("returns true for a revoked session", async () => {
      prisma.userSession.findUnique.mockResolvedValue({ revokedAt: new Date() });
      expect(await service.isRevoked("session-1")).toBe(true);
    });

    it("returns false for an active session", async () => {
      prisma.userSession.findUnique.mockResolvedValue({ revokedAt: null });
      expect(await service.isRevoked("session-1")).toBe(false);
    });
  });

  describe("stillActive", () => {
    beforeEach(() => prisma.userSession.update.mockResolvedValue({}));

    it("rejects a missing session without checking the company policy", async () => {
      prisma.userSession.findUnique.mockResolvedValue(null);

      expect(await service.stillActive("nope", "company-a")).toBe(false);
      expect(prisma.company.findUnique).not.toHaveBeenCalled();
    });

    it("rejects a revoked session", async () => {
      prisma.userSession.findUnique.mockResolvedValue({ revokedAt: new Date(), lastSeenAt: new Date() });

      expect(await service.stillActive("session-1", "company-a")).toBe(false);
      expect(prisma.userSession.update).not.toHaveBeenCalled();
    });

    it("accepts a long-idle session when the company has no timeout policy configured", async () => {
      prisma.userSession.findUnique.mockResolvedValue({ revokedAt: null, lastSeenAt: new Date(Date.now() - 1000 * 60 * 60 * 24) });
      prisma.company.findUnique.mockResolvedValue({ sessionTimeoutMinutes: null });

      expect(await service.stillActive("session-1", "company-a")).toBe(true);
    });

    it("rejects a session idle for longer than the configured timeout, without marking it seen", async () => {
      prisma.userSession.findUnique.mockResolvedValue({ revokedAt: null, lastSeenAt: new Date(Date.now() - 31 * 60 * 1000) });
      prisma.company.findUnique.mockResolvedValue({ sessionTimeoutMinutes: 30 });

      expect(await service.stillActive("session-1", "company-a")).toBe(false);
      expect(prisma.userSession.update).not.toHaveBeenCalled();
    });

    it("accepts a session still within the configured timeout and marks it seen", async () => {
      prisma.userSession.findUnique.mockResolvedValue({ revokedAt: null, lastSeenAt: new Date(Date.now() - 5 * 60 * 1000) });
      prisma.company.findUnique.mockResolvedValue({ sessionTimeoutMinutes: 30 });

      expect(await service.stillActive("session-1", "company-a")).toBe(true);
      expect(prisma.userSession.update).toHaveBeenCalledWith({ where: { id: "session-1" }, data: { lastSeenAt: expect.any(Date) } });
    });

    it("doesn't write lastSeenAt again within a minute of the last write", async () => {
      prisma.userSession.findUnique.mockResolvedValue({ revokedAt: null, lastSeenAt: new Date(Date.now() - 20 * 1000) });
      prisma.company.findUnique.mockResolvedValue({ sessionTimeoutMinutes: null });

      expect(await service.stillActive("session-1", "company-a")).toBe(true);
      expect(prisma.userSession.update).not.toHaveBeenCalled();
    });

    it("still accepts the request when marking the session seen fails", async () => {
      prisma.userSession.findUnique.mockResolvedValue({ revokedAt: null, lastSeenAt: new Date(Date.now() - 5 * 60 * 1000) });
      prisma.company.findUnique.mockResolvedValue({ sessionTimeoutMinutes: null });
      prisma.userSession.update.mockRejectedValue(new Error("connection reset"));

      expect(await service.stillActive("session-1", "company-a")).toBe(true);
    });
  });

  describe("revoke", () => {
    it("throws when the session doesn't exist", async () => {
      prisma.userSession.findUnique.mockResolvedValue(null);
      await expect(service.revoke("user-1", "session-1")).rejects.toThrow(NotFoundException);
    });

    it("refuses to revoke someone else's session", async () => {
      prisma.userSession.findUnique.mockResolvedValue({ id: "session-1", userId: "other-user" });
      await expect(service.revoke("user-1", "session-1")).rejects.toThrow(ForbiddenException);
      expect(prisma.userSession.update).not.toHaveBeenCalled();
    });

    it("revokes a session belonging to the caller", async () => {
      prisma.userSession.findUnique.mockResolvedValue({ id: "session-1", userId: "user-1" });
      prisma.userSession.update.mockResolvedValue({});

      const result = await service.revoke("user-1", "session-1");

      expect(result).toEqual({ ok: true });
      expect(prisma.userSession.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
