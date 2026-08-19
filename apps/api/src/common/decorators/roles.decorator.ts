import { SetMetadata } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";

export const ROLES_KEY = "roles";
/** Restricts a route to callers whose Membership.role is one of the given roles. */
export const Roles = (...roles: MembershipRole[]) => SetMetadata(ROLES_KEY, roles);
