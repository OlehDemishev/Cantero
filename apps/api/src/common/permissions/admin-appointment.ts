import { ForbiddenException } from "@nestjs/common";

/**
 * Managing members, invites and custom roles needs settings.roles, which a company can hand to any
 * role. Making or unmaking an admin stays with the owner, so that grant can never be used to reach
 * the admin-only routes (billing, SSO, API keys, company deletion) — the same rule as editing an
 * admin's permissions (PermissionsService).
 */
export function assertMayAppointAdmin(actorRole: string | undefined, touchesAdmin: boolean): void {
  if (touchesAdmin && actorRole !== "owner") throw new ForbiddenException("Only the owner can appoint, change or remove an admin");
}
