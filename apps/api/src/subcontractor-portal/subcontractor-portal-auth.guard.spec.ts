import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { SubcontractorPortalAuthGuard } from "./subcontractor-portal-auth.guard";
import type { SubcontractorPortalJwtService } from "./subcontractor-portal-jwt.service";
import type { PrismaService } from "../common/prisma/prisma.service";

describe("SubcontractorPortalAuthGuard", () => {
  let portalJwt: { verify: jest.Mock };
  let prisma: { subcontractor: { findFirst: jest.Mock } };
  let guard: SubcontractorPortalAuthGuard;

  function contextFor(request: Record<string, unknown>): ExecutionContext {
    return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    portalJwt = { verify: jest.fn().mockResolvedValue({ subcontractorId: "subcontractor-1", companyId: "company-1", tokenVersion: 2 }) };
    prisma = { subcontractor: { findFirst: jest.fn().mockResolvedValue({ portalTokenVersion: 2 }) } };
    guard = new SubcontractorPortalAuthGuard(portalJwt as unknown as SubcontractorPortalJwtService, prisma as unknown as PrismaService);
  });

  it("admits a valid token whose subcontractor exists and hasn't signed out since", async () => {
    const request: Record<string, unknown> = { headers: { authorization: "Bearer good" } };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(prisma.subcontractor.findFirst).toHaveBeenCalledWith({ where: { id: "subcontractor-1", companyId: "company-1" }, select: { portalTokenVersion: true } });
    expect(request.portalSubcontractor).toEqual({ subcontractorId: "subcontractor-1", companyId: "company-1" });
  });

  it("rejects a missing or invalid token", async () => {
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toThrow(UnauthorizedException);
    portalJwt.verify.mockRejectedValue(new Error("jwt expired"));
    await expect(guard.canActivate(contextFor({ headers: { authorization: "Bearer old" } }))).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a token issued before the subcontractor signed out", async () => {
    prisma.subcontractor.findFirst.mockResolvedValue({ portalTokenVersion: 3 });
    await expect(guard.canActivate(contextFor({ headers: { authorization: "Bearer good" } }))).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a token whose subcontractor no longer exists", async () => {
    prisma.subcontractor.findFirst.mockResolvedValue(null);
    await expect(guard.canActivate(contextFor({ headers: { authorization: "Bearer good" } }))).rejects.toThrow(UnauthorizedException);
  });
});
