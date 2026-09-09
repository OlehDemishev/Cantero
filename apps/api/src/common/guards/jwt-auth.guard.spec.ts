import { UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { SessionsService } from "../sessions/sessions.service";
import { PrismaService } from "../prisma/prisma.service";

function makeContext(request: Record<string, unknown>, isPublic = false) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(isPublic) } as unknown as Reflector;
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;
  return { reflector, context };
}

describe("JwtAuthGuard", () => {
  let jwt: { verifyAsync: jest.Mock };
  let sessions: { isRevokedOrTimedOut: jest.Mock; touch: jest.Mock };
  let prisma: { membership: { findUnique: jest.Mock } };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() };
    sessions = { isRevokedOrTimedOut: jest.fn().mockResolvedValue(false), touch: jest.fn() };
    prisma = { membership: { findUnique: jest.fn() } };
    guard = new JwtAuthGuard(
      jwt as unknown as JwtService,
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector,
      sessions as unknown as SessionsService,
      prisma as unknown as PrismaService,
    );
  });

  it("allows a @Public() route without checking the token", async () => {
    const { reflector, context } = makeContext({ headers: {} }, true);
    const publicGuard = new JwtAuthGuard(jwt as unknown as JwtService, reflector, sessions as unknown as SessionsService, prisma as unknown as PrismaService);

    await expect(publicGuard.canActivate(context)).resolves.toBe(true);
  });

  it("rejects a request with no bearer token", async () => {
    const { context } = makeContext({ headers: {} });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects an invalid or expired token", async () => {
    jwt.verifyAsync.mockRejectedValue(new Error("bad token"));
    const { context } = makeContext({ headers: { authorization: "Bearer garbage" } });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a portal-style token carrying a `kind` claim", async () => {
    jwt.verifyAsync.mockResolvedValue({ userId: "u1", companyId: "c1", kind: "client_portal" });
    const { context } = makeContext({ headers: { authorization: "Bearer x" } });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a token whose session was revoked", async () => {
    jwt.verifyAsync.mockResolvedValue({ userId: "u1", companyId: "c1", sid: "s1" });
    sessions.isRevokedOrTimedOut.mockResolvedValue(true);
    const { context } = makeContext({ headers: { authorization: "Bearer x" } });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a token for a membership that no longer exists (removed member)", async () => {
    jwt.verifyAsync.mockResolvedValue({ userId: "u1", companyId: "c1", sid: "s1", role: "admin" });
    prisma.membership.findUnique.mockResolvedValue(null);
    const { context } = makeContext({ headers: { authorization: "Bearer x" } });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("overwrites a stale role claim with the membership's current role", async () => {
    jwt.verifyAsync.mockResolvedValue({ userId: "u1", companyId: "c1", sid: "s1", role: "admin" });
    prisma.membership.findUnique.mockResolvedValue({ role: "worker", customRole: null });
    const request: Record<string, unknown> = { headers: { authorization: "Bearer x" } };
    const { context } = makeContext(request);

    await guard.canActivate(context);

    expect((request.user as { role: string }).role).toBe("worker");
  });

  it("attaches the custom role's basePermissions as additionalRoles", async () => {
    jwt.verifyAsync.mockResolvedValue({ userId: "u1", companyId: "c1", sid: "s1", role: "worker" });
    prisma.membership.findUnique.mockResolvedValue({ role: "worker", customRole: { basePermissions: ["estimator", "foreman"] } });
    const request: Record<string, unknown> = { headers: { authorization: "Bearer x" } };
    const { context } = makeContext(request);

    await guard.canActivate(context);

    expect((request.user as { additionalRoles: string[] }).additionalRoles).toEqual(["estimator", "foreman"]);
  });
});
