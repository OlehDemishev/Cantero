import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { AuthUser } from "@cantero/shared";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { SessionsService } from "../sessions/sessions.service";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../permissions/permissions.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException("Missing bearer token");

    let payload: AuthUser & { kind?: string };
    try {
      payload = await this.jwtService.verifyAsync<AuthUser & { kind?: string }>(token);
      // Any portal token (client, subcontractor, ...) is signed with its own secret and never
      // reaches here for portal routes (marked @Public()) — this rejects one anyway, in case
      // it's replayed against an internal route or a secret is ever misconfigured to match.
      // AuthUser payloads never carry `kind`, so any truthy value here is a non-internal token.
      if (payload.kind) throw new Error("wrong token kind");
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    if (payload.sid && (await this.sessions.isRevokedOrTimedOut(payload.sid, payload.companyId))) {
      throw new UnauthorizedException("Session has been signed out");
    }
    if (payload.sid) this.sessions.touch(payload.sid);

    // The token's own role/additionalRoles are a snapshot from whenever it was issued — up to 7
    // days stale. A removed member or one whose role/custom-role changed since must be caught
    // here, on every request, rather than only at next login: this re-reads the actual membership
    // and overwrites the token's role claims with what's true right now.
    const membership = await this.prisma.membership.findUnique({
      where: { userId_companyId: { userId: payload.userId, companyId: payload.companyId } },
      include: { customRole: true },
    });
    if (!membership) throw new UnauthorizedException("You're no longer a member of this company");

    request.user = {
      ...payload,
      role: membership.role,
      additionalRoles: membership.customRole?.basePermissions,
      permissions: await this.permissions.effectiveFor(payload.companyId, membership.role, membership.customRole),
    } satisfies AuthUser;
    return true;
  }
}

function extractBearerToken(header?: string): string | undefined {
  if (!header) return undefined;
  const [type, token] = header.split(" ");
  return type === "Bearer" ? token : undefined;
}
