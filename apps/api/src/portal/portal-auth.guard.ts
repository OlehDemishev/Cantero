import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { PortalJwtService } from "./portal-jwt.service";

/** Requires a valid client-portal token whose client still exists in that company and hasn't signed out
 * since it was issued (portalTokenVersion, bumped by POST …/auth/logout). */
@Injectable()
export class PortalAuthGuard implements CanActivate {
  constructor(
    private readonly portalJwt: PortalJwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException("Missing bearer token");

    let verified: Awaited<ReturnType<PortalJwtService["verify"]>>;
    try {
      verified = await this.portalJwt.verify(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    const { tokenVersion, ...portalClient } = verified;
    const holder = await this.prisma.client.findFirst({
      where: { id: portalClient.clientId, companyId: portalClient.companyId },
      select: { portalTokenVersion: true },
    });
    if (!holder || holder.portalTokenVersion !== tokenVersion) throw new UnauthorizedException("This portal sign-in is no longer valid — request a new link");

    request.portalClient = portalClient;
    return true;
  }
}

function extractBearerToken(header?: string): string | undefined {
  if (!header) return undefined;
  const [type, token] = header.split(" ");
  return type === "Bearer" ? token : undefined;
}
