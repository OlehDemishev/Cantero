import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import {
  DEFAULT_GRANTS,
  LOCKED_ROLES,
  PERMISSIONS,
  SENSITIVE_PERMISSIONS,
  resetRolePermissionsSchema,
  setRolePermissionSchema,
  type AuthUser,
  type ResetRolePermissionsInput,
  type SetRolePermissionInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Requires } from "../common/decorators/permissions.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PermissionsService } from "../common/permissions/permissions.service";

/** Settings → Roles & permissions: who may do what in this company. */
@Requires("settings.roles")
@Controller("company/permissions")
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  /** Every role × capability as it stands, which of those differ from the default, and the catalog
   * the screen needs to lay them out. */
  @Get()
  async matrix(@CurrentUser() user: AuthUser) {
    return {
      permissions: Object.entries(PERMISSIONS).map(([key, p]) => ({ key, section: p.section, sensitive: (SENSITIVE_PERMISSIONS as readonly string[]).includes(key) })),
      roles: Object.keys(DEFAULT_GRANTS).map((role) => ({
        role,
        // What this caller may change: never the owner's, an admin's only as the owner.
        editable: !(LOCKED_ROLES as readonly string[]).includes(role) && (role !== "admin" || user.role === "owner"),
      })),
      grants: await this.permissions.matrix(user.companyId),
    };
  }

  @Patch()
  set(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(setRolePermissionSchema)) body: SetRolePermissionInput) {
    return this.permissions.setGrant(user.companyId, { userId: user.userId, name: user.name, role: user.role }, body.role, body.permission, body.granted);
  }

  @Post("reset")
  reset(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(resetRolePermissionsSchema)) body: ResetRolePermissionsInput) {
    return this.permissions.resetToDefaults(user.companyId, { userId: user.userId, name: user.name, role: user.role }, body.role);
  }
}
