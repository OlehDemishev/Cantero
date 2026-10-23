import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { SupplierPortalAuthGuard } from "./supplier-portal-auth.guard";
import type { SupplierPortalJwtService } from "./supplier-portal-jwt.service";
import type { PrismaService } from "../common/prisma/prisma.service";

describe("SupplierPortalAuthGuard", () => {
  let portalJwt: { verify: jest.Mock };
  let prisma: { supplier: { findFirst: jest.Mock } };
  let guard: SupplierPortalAuthGuard;

  function contextFor(request: Record<string, unknown>): ExecutionContext {
    return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    portalJwt = { verify: jest.fn().mockResolvedValue({ supplierId: "supplier-1", companyId: "company-1", tokenVersion: 2 }) };
    prisma = { supplier: { findFirst: jest.fn().mockResolvedValue({ portalTokenVersion: 2 }) } };
    guard = new SupplierPortalAuthGuard(portalJwt as unknown as SupplierPortalJwtService, prisma as unknown as PrismaService);
  });

  it("admits a valid token whose supplier exists and hasn't signed out since", async () => {
    const request: Record<string, unknown> = { headers: { authorization: "Bearer good" } };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(prisma.supplier.findFirst).toHaveBeenCalledWith({ where: { id: "supplier-1", companyId: "company-1" }, select: { portalTokenVersion: true } });
    expect(request.portalSupplier).toEqual({ supplierId: "supplier-1", companyId: "company-1" });
  });

  it("rejects a missing or invalid token", async () => {
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toThrow(UnauthorizedException);
    portalJwt.verify.mockRejectedValue(new Error("jwt expired"));
    await expect(guard.canActivate(contextFor({ headers: { authorization: "Bearer old" } }))).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a token issued before the supplier signed out", async () => {
    prisma.supplier.findFirst.mockResolvedValue({ portalTokenVersion: 3 });
    await expect(guard.canActivate(contextFor({ headers: { authorization: "Bearer good" } }))).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a token whose supplier no longer exists", async () => {
    prisma.supplier.findFirst.mockResolvedValue(null);
    await expect(guard.canActivate(contextFor({ headers: { authorization: "Bearer good" } }))).rejects.toThrow(UnauthorizedException);
  });
});
