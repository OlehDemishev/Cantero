import { z } from "zod";
import { MEMBERSHIP_ROLES_MANAGEABLE } from "./company";
import { MEMBERSHIP_ROLES } from "./roles";
import { PERMISSION_KEYS, type Permission } from "./permissions";

const permissionKey = z.string().refine((p): p is Permission => (PERMISSION_KEYS as string[]).includes(p), "Unknown permission");

export const createCustomRoleSchema = z.object({
  name: z.string().min(1).max(80),
  basePermissions: z.array(z.enum(MEMBERSHIP_ROLES_MANAGEABLE)).min(1),
  /** Capabilities on top of the base roles' — e.g. "foreman, plus sees the budget". */
  extraPermissions: z.array(permissionKey).max(PERMISSION_KEYS.length).default([]),
});
export type CreateCustomRoleInput = z.input<typeof createCustomRoleSchema>;

export const assignCustomRoleSchema = z.object({
  customRoleId: z.string().uuid().nullable(),
});
export type AssignCustomRoleInput = z.infer<typeof assignCustomRoleSchema>;

/** One cell of Settings → Roles & permissions: grant or revoke a capability for a role. */
export const setRolePermissionSchema = z.object({
  role: z.enum(MEMBERSHIP_ROLES),
  permission: permissionKey,
  granted: z.boolean(),
});
export type SetRolePermissionInput = z.infer<typeof setRolePermissionSchema>;

export const resetRolePermissionsSchema = z.object({
  /** Omitted: every role the caller may change. */
  role: z.enum(MEMBERSHIP_ROLES).optional(),
});
export type ResetRolePermissionsInput = z.infer<typeof resetRolePermissionsSchema>;
