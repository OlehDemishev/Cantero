import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { SupplierPortalJwtService } from "./supplier-portal-jwt.service";

/** Requires a valid supplier-portal token whose supplier still exists in that company and hasn't signed out
 * since it was issued (portalTokenVersion, bumped by POST …/auth/logout). */
@Injectable()
export class SupplierPortalAuthGuard implements CanActivate {
  constructor(
    private readonly portalJwt: SupplierPortalJwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException("Missing bearer token");

    let verified: Awaited<ReturnType<SupplierPortalJwtService["verify"]>>;
    try {
      verified = await this.portalJwt.verify(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    const { tokenVersion, ...portalSupplier } = verified;
    const holder = await this.prisma.supplier.findFirst({
      where: { id: portalSupplier.supplierId, companyId: portalSupplier.companyId },
      select: { portalTokenVersion: true },
    });
    if (!holder || holder.portalTokenVersion !== tokenVersion) throw new UnauthorizedException("This portal sign-in is no longer valid — request a new link");

    request.portalSupplier = portalSupplier;
    return true;
  }
}

function extractBearerToken(header?: string): string | undefined {
  if (!header) return undefined;
  const [type, token] = header.split(" ");
  return type === "Bearer" ? token : undefined;
}
