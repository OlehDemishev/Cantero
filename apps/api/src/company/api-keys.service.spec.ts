import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ApiKeysService, hashApiKey } from "./api-keys.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Admin" };

describe("ApiKeysService", () => {
  let service: ApiKeysService;
  let prisma: {
    apiKey: { findMany: jest.Mock; create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      apiKey: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [ApiKeysService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(ApiKeysService);
  });

  describe("hashApiKey()", () => {
    it("is deterministic for the same input", () => {
      expect(hashApiKey("cnt_abc")).toBe(hashApiKey("cnt_abc"));
    });

    it("differs for different inputs", () => {
      expect(hashApiKey("cnt_abc")).not.toBe(hashApiKey("cnt_xyz"));
    });
  });

  describe("create()", () => {
    it("returns the raw key only once, alongside the persisted hash and prefix", async () => {
      prisma.apiKey.create.mockImplementation(({ data, select }) => ({
        id: "key-1",
        name: data.name,
        keyPrefix: data.keyPrefix,
        scopes: data.scopes,
        expiresAt: data.expiresAt,
        createdAt: new Date(),
        __select: select,
      }));

      const result = await service.create(COMPANY_A, ACTOR, { name: "CI key" });

      expect(result.key).toMatch(/^cnt_[0-9a-f]{48}$/);
      expect(result.keyPrefix).toBe(result.key.slice(0, 12));
      const createCall = prisma.apiKey.create.mock.calls[0][0];
      expect(createCall.data.keyHash).toBe(hashApiKey(result.key));
      expect(createCall.data.companyId).toBe(COMPANY_A);
      expect(createCall.data.scopes).toEqual([]);
    });

    it("defaults expiresAt to undefined when not provided, and parses it when given", async () => {
      prisma.apiKey.create.mockImplementation(({ data }) => ({ id: "key-1", name: data.name, keyPrefix: data.keyPrefix }));

      await service.create(COMPANY_A, ACTOR, { name: "No expiry" });
      expect(prisma.apiKey.create.mock.calls[0][0].data.expiresAt).toBeUndefined();

      await service.create(COMPANY_A, ACTOR, { name: "Expiring", expiresAt: "2030-01-01T00:00:00.000Z" });
      expect(prisma.apiKey.create.mock.calls[1][0].data.expiresAt).toEqual(new Date("2030-01-01T00:00:00.000Z"));
    });

    it("records an audit entry naming the new key", async () => {
      prisma.apiKey.create.mockResolvedValue({ id: "key-1", name: "CI key" });

      await service.create(COMPANY_A, ACTOR, { name: "CI key" });

      expect(audit.record).toHaveBeenCalledWith(COMPANY_A, ACTOR, "api_key.created", "ApiKey", "key-1", expect.stringContaining("CI key"));
    });
  });

  describe("revoke()", () => {
    it("throws when the key doesn't exist for this company", async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);
      await expect(service.revoke(COMPANY_A, ACTOR, "key-1")).rejects.toThrow(NotFoundException);
      expect(prisma.apiKey.update).not.toHaveBeenCalled();
    });

    it("scopes the lookup to the given company (can't revoke another company's key)", async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);
      await expect(service.revoke(COMPANY_A, ACTOR, "key-1")).rejects.toThrow(NotFoundException);
      expect(prisma.apiKey.findFirst).toHaveBeenCalledWith({ where: { id: "key-1", companyId: COMPANY_A } });
    });

    it("sets revokedAt and records an audit entry on success", async () => {
      prisma.apiKey.findFirst.mockResolvedValue({ id: "key-1", name: "CI key" });

      const result = await service.revoke(COMPANY_A, ACTOR, "key-1");

      expect(result).toEqual({ ok: true });
      expect(prisma.apiKey.update).toHaveBeenCalledWith({ where: { id: "key-1" }, data: { revokedAt: expect.any(Date) } });
      expect(audit.record).toHaveBeenCalledWith(COMPANY_A, ACTOR, "api_key.revoked", "ApiKey", "key-1", expect.stringContaining("CI key"));
    });
  });
});
