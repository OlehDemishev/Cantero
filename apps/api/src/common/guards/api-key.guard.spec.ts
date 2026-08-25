import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiKeyGuard } from "./api-key.guard";
import { PrismaService } from "../prisma/prisma.service";
import { hashApiKey } from "../../company/api-keys.service";

function makeContext(headers: Record<string, string>) {
  const request: Record<string, any> = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
  } as any;
}

describe("ApiKeyGuard", () => {
  let guard: ApiKeyGuard;
  let prisma: { apiKey: { findFirst: jest.Mock; update: jest.Mock } };
  let reflector: { get: jest.Mock };

  beforeEach(() => {
    prisma = { apiKey: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) } };
    reflector = { get: jest.fn() };
    guard = new ApiKeyGuard(prisma as unknown as PrismaService, reflector as unknown as Reflector);
  });

  it("rejects a request with no X-Api-Key header", async () => {
    await expect(guard.canActivate(makeContext({}))).rejects.toThrow(UnauthorizedException);
  });

  it("rejects an unknown or revoked key", async () => {
    prisma.apiKey.findFirst.mockResolvedValue(null);

    await expect(guard.canActivate(makeContext({ "x-api-key": "cnt_bad" }))).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a key past its expiresAt", async () => {
    prisma.apiKey.findFirst.mockResolvedValue({
      id: "k-1",
      companyId: "company-a",
      scopes: [],
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(guard.canActivate(makeContext({ "x-api-key": "cnt_expired" }))).rejects.toThrow(UnauthorizedException);
  });

  it("allows an unrestricted key (empty scopes) through any @RequireScope route", async () => {
    prisma.apiKey.findFirst.mockResolvedValue({ id: "k-1", companyId: "company-a", scopes: [], expiresAt: null });
    reflector.get.mockReturnValue("projects");

    const context = makeContext({ "x-api-key": "cnt_ok" });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(context.switchToHttp().getRequest().companyId).toBe("company-a");
  });

  it("allows a scoped key through a route it's scoped for", async () => {
    prisma.apiKey.findFirst.mockResolvedValue({ id: "k-1", companyId: "company-a", scopes: ["projects", "clients"], expiresAt: null });
    reflector.get.mockReturnValue("projects");

    await expect(guard.canActivate(makeContext({ "x-api-key": "cnt_ok" }))).resolves.toBe(true);
  });

  it("rejects a scoped key on a route outside its scopes", async () => {
    prisma.apiKey.findFirst.mockResolvedValue({ id: "k-1", companyId: "company-a", scopes: ["projects"], expiresAt: null });
    reflector.get.mockReturnValue("budget");

    await expect(guard.canActivate(makeContext({ "x-api-key": "cnt_ok" }))).rejects.toThrow(ForbiddenException);
  });

  it("looks the key up by its SHA-256 hash, never the raw value", async () => {
    prisma.apiKey.findFirst.mockResolvedValue({ id: "k-1", companyId: "company-a", scopes: [], expiresAt: null });

    await guard.canActivate(makeContext({ "x-api-key": "cnt_raw_key" }));

    expect(prisma.apiKey.findFirst).toHaveBeenCalledWith({
      where: { keyHash: hashApiKey("cnt_raw_key"), revokedAt: null },
    });
  });
});
