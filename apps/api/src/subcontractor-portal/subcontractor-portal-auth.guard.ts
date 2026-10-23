import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { SubcontractorPortalJwtService } from "./subcontractor-portal-jwt.service";

/** Requires a valid subcontractor-portal token whose subcontractor still exists in that company and hasn't signed out
 * since it was issued (portalTokenVersion, bumped by POST …/auth/logout). */
@Injectable()
export class SubcontractorPortalAuthGuard implements CanActivate {
  constructor(
    private readonly portalJwt: SubcontractorPortalJwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException("Missing bearer token");

    let verified: Awaited<ReturnType<SubcontractorPortalJwtService["verify"]>>;
    try {
      verified = await this.portalJwt.verify(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    const { tokenVersion, ...portalSubcontractor } = verified;
    const holder = await this.prisma.subcontractor.findFirst({
      where: { id: portalSubcontractor.subcontractorId, companyId: portalSubcontractor.companyId },
      select: { portalTokenVersion: true },
    });
    if (!holder || holder.portalTokenVersion !== tokenVersion) throw new UnauthorizedException("This portal sign-in is no longer valid — request a new link");

    request.portalSubcontractor = portalSubcontractor;
    return true;
  }
}

function extractBearerToken(header?: string): string | undefined {
  if (!header) return undefined;
  const [type, token] = header.split(" ");
  return type === "Bearer" ? token : undefined;
}
