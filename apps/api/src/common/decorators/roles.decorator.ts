import { SetMetadata } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";

export const ROLES_KEY = "roles";
export const OPEN_TO_ALL_ROLES_KEY = "openToAllRoles";

/** Restricts a route to callers whose Membership.role is one of the given roles — fixed, whatever the
 * company's permission settings. New restrictions use @Requires (permissions.decorator.ts), which a
 * company can adjust per role. */
export const Roles = (...roles: MembershipRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Open to every member, on purpose, for the reason given. On a handler it also lifts its
 * controller's @Roles/@Requires (a site action inside an otherwise restricted area).
 * roles-coverage.spec.ts requires every internal route to have this, @Requires or @Roles, so a new one never ends up open to
 * a worker by accident.
 */
export const OpenToAllRoles = (reason: string) => SetMetadata(OPEN_TO_ALL_ROLES_KEY, reason);
