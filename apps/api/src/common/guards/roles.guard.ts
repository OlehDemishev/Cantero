import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { MembershipRole } from "@prisma/client";
import type { AuthUser } from "@cantero/shared";
import { OPEN_TO_ALL_ROLES_KEY, ROLES_KEY } from "../decorators/roles.decorator";
import { REQUIRES_KEY, permissionFor, type Requirement } from "../decorators/permissions.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // A handler marked open lifts its controller's restriction; see OpenToAllRoles.
    if (this.reflector.get<string | undefined>(OPEN_TO_ALL_ROLES_KEY, context.getHandler())) return true;

    // A configurable capability (@Requires) and fixed roles (@Roles) can both apply; both must pass,
    // so a company can narrow a fixed-role route further but never widen it past its roles.
    const requirement = this.reflector.getAllAndOverride<Requirement | undefined>(REQUIRES_KEY, [context.getHandler(), context.getClass()]);
    if (requirement) {
      const request = context.switchToHttp().getRequest();
      const user = request.user as AuthUser | undefined;
      if (!user) return false;
      const needed = permissionFor(requirement, request.method ?? "GET");
      if (!user.permissions?.includes(needed)) throw new ForbiddenException(`Requires the "${needed}" permission`);
    }

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
