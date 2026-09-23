import { SetMetadata } from "@nestjs/common";
import type { Permission } from "@cantero/shared";

export const REQUIRES_KEY = "requiresPermission";

/** What a route needs: one capability, or one for reading (GET) and one for changing (the rest). */
export type Requirement = Permission | { read: Permission; write: Permission };

/**
 * The capability a caller needs (packages/shared/src/permissions.ts). Which roles hold it is
 * DEFAULT_GRANTS plus the company's own settings, so an owner can widen or narrow it per role. On a
 * controller it covers every route; a handler's own @Requires replaces it.
 */
export const Requires = (permission: Permission) => SetMetadata(REQUIRES_KEY, permission satisfies Requirement);

/** One capability to read and another to change — for a controller where viewing and editing belong
 * to different people (e.g. everyone reads the cost codes, pricing edits them). */
export const RequiresFor = (read: Permission, write: Permission) => SetMetadata(REQUIRES_KEY, { read, write } satisfies Requirement);

/** The capability a requirement asks of a request with this HTTP method. */
export function permissionFor(requirement: Requirement, method: string): Permission {
  if (typeof requirement === "string") return requirement;
  return method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD" ? requirement.read : requirement.write;
}
