import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { PortalAuthGuard } from "./portal-auth.guard";
import type { PortalJwtService } from "./portal-jwt.service";
import type { PrismaService } from "../common/prisma/prisma.service";

describe("PortalAuthGuard", () => {
  let portalJwt: { verify: jest.Mock };
  let prisma: { client: { findFirst: jest.Mock } };
  let guard: PortalAuthGuard;

  function contextFor(request: Record<string, unknown>): ExecutionContext {
    return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    portalJwt = { verify: jest.fn().mockResolvedValue({ clientId: "client-1", companyId: "company-1", tokenVersion: 2 }) };
    prisma = { client: { findFirst: jest.fn().mockResolvedValue({ portalTokenVersion: 2 }) } };
    guard = new PortalAuthGuard(portalJwt as unknown as PortalJwtService, prisma as unknown as PrismaService);
  });

  it("admits a valid token whose client exists and hasn't signed out since", async () => {
    const request: Record<string, unknown> = { headers: { authorization: "Bearer good" } };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(prisma.client.findFirst).toHaveBeenCalledWith({ where: { id: "client-1", companyId: "company-1" }, select: { portalTokenVersion: true } });
    expect(request.portalClient).toEqual({ clientId: "client-1", companyId: "company-1" });
  });

  it("rejects a missing or invalid token", async () => {
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toThrow(UnauthorizedException);
    portalJwt.verify.mockRejectedValue(new Error("jwt expired"));
    await expect(guard.canActivate(contextFor({ headers: { authorization: "Bearer old" } }))).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a token issued before the client signed out", async () => {
    prisma.client.findFirst.mockResolvedValue({ portalTokenVersion: 3 });
    await expect(guard.canActivate(contextFor({ headers: { authorization: "Bearer good" } }))).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a token whose client no longer exists", async () => {
    prisma.client.findFirst.mockResolvedValue(null);
    await expect(guard.canActivate(contextFor({ headers: { authorization: "Bearer good" } }))).rejects.toThrow(UnauthorizedException);
  });
});
