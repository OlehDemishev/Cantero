import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthUser } from "@cantero/shared";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { PrismaService } from "../prisma/prisma.service";

/** Matches a dotted-quad IPv4 address against an exact IP or a CIDR block ("a.b.c.d/n"). */
function ipMatches(ip: string, rule: string): boolean {
  if (!rule.includes("/")) return ip === rule;

  const [rangeIp, prefixStr] = rule.split("/");
  const prefix = Number(prefixStr);
  const toInt = (addr: string) => addr.split(".").map(Number).reduce((acc, octet) => (acc << 8) + octet, 0) >>> 0;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || !/^\d{1,3}(\.\d{1,3}){3}$/.test(rangeIp) || Number.isNaN(prefix)) return false;

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (toInt(ip) & mask) === (toInt(rangeIp) & mask);
}

/**
 * Runs after JwtAuthGuard (needs `request.user.companyId`) — a company with a non-empty
 * ipAllowlist rejects any authenticated request from an IP that doesn't match one of its entries.
 */
@Injectable()
export class IpAllowlistGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    if (!user) return true; // JwtAuthGuard already rejected unauthenticated requests

    const company = await this.prisma.company.findUnique({ where: { id: user.companyId }, select: { ipAllowlist: true } });
    if (!company || company.ipAllowlist.length === 0) return true;

    const requestIp = (request.ip as string | undefined)?.replace(/^::ffff:/, "") ?? "";
    const allowed = company.ipAllowlist.some((rule) => ipMatches(requestIp, rule));
    if (!allowed) throw new ForbiddenException("This IP address isn't on the company's allowlist");
    return true;
  }
}
