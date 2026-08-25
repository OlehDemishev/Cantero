import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { MembershipRole } from "@prisma/client";
import type { AuthUser } from "@cantero/shared";
import { ROLES_KEY } from "../decorators/roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<MembershipRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    if (!user) return false;

    const hasBaseRole = requiredRoles.includes(user.role as MembershipRole);
    // additionalRoles come from a company-defined CustomRole (see CustomRole in schema.prisma) —
    // purely additive on top of the member's own role, never a substitute or restriction.
    const hasAdditionalRole = user.additionalRoles?.some((r) => requiredRoles.includes(r as MembershipRole)) ?? false;
    if (!hasBaseRole && !hasAdditionalRole) {
      throw new ForbiddenException(`Requires one of these roles: ${requiredRoles.join(", ")}`);
    }
    return true;
  }
}
