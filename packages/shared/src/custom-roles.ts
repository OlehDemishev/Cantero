import { z } from "zod";
import { MEMBERSHIP_ROLES_MANAGEABLE } from "./company";

export const createCustomRoleSchema = z.object({
  name: z.string().min(1).max(80),
  basePermissions: z.array(z.enum(MEMBERSHIP_ROLES_MANAGEABLE)).min(1),
});
export type CreateCustomRoleInput = z.infer<typeof createCustomRoleSchema>;

export const assignCustomRoleSchema = z.object({
  customRoleId: z.string().uuid().nullable(),
});
export type AssignCustomRoleInput = z.infer<typeof assignCustomRoleSchema>;
