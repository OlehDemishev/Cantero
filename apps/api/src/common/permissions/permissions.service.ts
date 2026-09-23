import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import {
  DEFAULT_GRANTS,
  LOCKED_ROLES,
  PERMISSION_KEYS,
  effectivePermissions,
  isPermission,
  type Permission,
  type PermissionOverride,
} from "@cantero/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditActor } from "../audit/audit.service";

/** Overrides are read on every request; this long they're served from memory, and a change made
 * through setGrant() takes effect at once on this instance (others catch up within the window). */
const CACHE_TTL_MS = 30 * 1000;

export interface RolePermissionRow {
  role: MembershipRole;
  permission: Permission;
  granted: boolean;
  isDefault: boolean;
}

/**
 * Who may do what in a company: each role's DEFAULT_GRANTS with the company's own changes applied
 * (Settings → Roles & permissions). Only differences from the default are stored.
 */
@Injectable()
export class PermissionsService {
  private readonly cache = new Map<string, { at: number; overrides: PermissionOverride[] }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async overridesFor(companyId: string): Promise<PermissionOverride[]> {
    const hit = this.cache.get(companyId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.overrides;
    const rows = await this.prisma.rolePermissionOverride.findMany({ where: { companyId } });
    const overrides = rows.filter((r) => isPermission(r.permission)).map((r) => ({ role: r.role, permission: r.permission as Permission, granted: r.granted }));
    this.cache.set(companyId, { at: Date.now(), overrides });
    return overrides;
  }

  /** A member's capabilities, from their role, the company's overrides and their custom role. */
  async effectiveFor(
    companyId: string,
    role: MembershipRole,
    customRole?: { basePermissions: MembershipRole[]; extraPermissions: string[] } | null,
  ): Promise<Permission[]> {
    const overrides = await this.overridesFor(companyId);
    const set = effectivePermissions(role, overrides, customRole ? { baseRoles: customRole.basePermissions, extra: customRole.extraPermissions } : undefined);
    return [...set];
  }

  /** The whole matrix for the settings screen: every role × capability, with whether it's the default. */
  async matrix(companyId: string): Promise<RolePermissionRow[]> {
    const overrides = await this.overridesFor(companyId);
    const rows: RolePermissionRow[] = [];
    for (const role of Object.keys(DEFAULT_GRANTS) as MembershipRole[]) {
      const granted = effectivePermissions(role, overrides);
      for (const permission of PERMISSION_KEYS) {
        rows.push({ role, permission, granted: granted.has(permission), isDefault: granted.has(permission) === DEFAULT_GRANTS[role].includes(permission) });
      }
    }
    return rows;
  }

  /**
   * Grants or revokes one capability for one role. Setting it back to the default removes the
   * override. The owner's capabilities never change; only the owner changes an admin's.
   */
  async setGrant(companyId: string, actor: AuditActor & { role: string }, role: MembershipRole, permission: string, granted: boolean) {
    if (!isPermission(permission)) throw new BadRequestException(`Unknown permission "${permission}"`);
    if (LOCKED_ROLES.includes(role)) throw new BadRequestException("The owner always has every permission");
    if (role === "admin" && actor.role !== "owner") throw new ForbiddenException("Only the owner can change an admin's permissions");

    const isDefault = DEFAULT_GRANTS[role].includes(permission) === granted;
    if (isDefault) {
      await this.prisma.rolePermissionOverride.deleteMany({ where: { companyId, role, permission } });
    } else {
      await this.prisma.rolePermissionOverride.upsert({
        where: { companyId_role_permission: { companyId, role, permission } },
        create: { companyId, role, permission, granted, updatedByUserId: actor.userId ?? null },
        update: { granted, updatedByUserId: actor.userId ?? null },
      });
    }
    this.cache.delete(companyId);
    this.audit.record(companyId, actor, "role_permission.changed", "RolePermissionOverride", `${role}:${permission}`, `${granted ? "Granted" : "Revoked"} ${permission} for ${role}${isDefault ? " (back to default)" : ""}`);
    return { role, permission, granted, isDefault };
  }

  /** Drops every change for one role (or all roles), back to DEFAULT_GRANTS. */
  async resetToDefaults(companyId: string, actor: AuditActor & { role: string }, role?: MembershipRole) {
    if (role === "admin" && actor.role !== "owner") throw new ForbiddenException("Only the owner can change an admin's permissions");
    const where = role ? { companyId, role } : actor.role === "owner" ? { companyId } : { companyId, role: { not: "admin" as MembershipRole } };
    const { count } = await this.prisma.rolePermissionOverride.deleteMany({ where });
    this.cache.delete(companyId);
    this.audit.record(companyId, actor, "role_permission.reset", "RolePermissionOverride", role ?? "all", `Reset ${role ?? "all roles"} to default permissions (${count} change${count === 1 ? "" : "s"} dropped)`);
    return { reset: count };
  }
}
