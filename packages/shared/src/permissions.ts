import type { MembershipRole } from "./roles";

/**
 * What a member may see and do, as capabilities rather than roles. Each role starts from
 * DEFAULT_GRANTS; an owner or admin can then grant or revoke any capability per role for their own
 * company (Settings → Roles & permissions), and only the differences are stored, so an improved
 * default still reaches every company that never touched it. The API's @Requires and the web app's
 * hiding both read this one table.
 */
export const PERMISSION_SECTIONS = ["finance", "commercial", "site", "people", "projects", "settings"] as const;
export type PermissionSection = (typeof PERMISSION_SECTIONS)[number];

export const PERMISSIONS = {
  // Finance
  "finance.view": { section: "finance" },
  "finance.manage": { section: "finance" },
  "finance.export": { section: "finance" },
  "finance.taxProfiles": { section: "finance" },
  "reports.custom": { section: "finance" },
  "costing.view": { section: "finance" },
  // Commercial
  "estimates.view": { section: "commercial" },
  "estimates.manage": { section: "commercial" },
  "pricing.manage": { section: "commercial" },
  "clients.view": { section: "commercial" },
  "clients.manage": { section: "commercial" },
  "contracts.view": { section: "commercial" },
  "contracts.manage": { section: "commercial" },
  "purchasing.view": { section: "commercial" },
  "purchasing.manage": { section: "commercial" },
  "subcontractors.view": { section: "commercial" },
  "subcontractors.manage": { section: "commercial" },
  // Site
  "site.manage": { section: "site" },
  "site.dailyLogs.create": { section: "site" },
  "site.crewTime": { section: "site" },
  "equipment.costs": { section: "site" },
  "templates.field": { section: "site" },
  "reports.operations": { section: "site" },
  // People
  "people.rates": { section: "people" },
  "people.contacts": { section: "people" },
  "hr.cases": { section: "people" },
  "hr.payroll": { section: "people" },
  "training.manage": { section: "people" },
  // Projects
  "projects.all": { section: "projects" },
  "projects.manage": { section: "projects" },
  // Company settings
  "templates.company": { section: "settings" },
  "settings.roles": { section: "settings" },
} as const satisfies Record<string, { section: PermissionSection }>;

export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

/**
 * The ladder each role starts from: a worker does their own site work, a foreman runs the site, an
 * estimator prepares the commercial side, an accountant runs the money, admin and owner see all.
 */
const WORKER: Permission[] = ["projects.all"];
const FOREMAN: Permission[] = [
  ...WORKER,
  "site.manage",
  "site.dailyLogs.create",
  "site.crewTime",
  "templates.field",
  "reports.operations",
  "subcontractors.view",
  "purchasing.view",
  "people.contacts",
  "training.manage",
];
const ESTIMATOR: Permission[] = [
  ...WORKER,
  "estimates.view",
  "estimates.manage",
  "pricing.manage",
  "clients.view",
  "clients.manage",
  "contracts.view",
  "costing.view",
  "purchasing.view",
  "subcontractors.view",
];
const ACCOUNTANT: Permission[] = [
  ...WORKER,
  "finance.view",
  "finance.manage",
  "finance.export",
  "finance.taxProfiles",
  "reports.custom",
  "reports.operations",
  "costing.view",
  "estimates.view",
  "clients.view",
  "contracts.view",
  "purchasing.view",
  "purchasing.manage",
  "subcontractors.view",
  "hr.payroll",
  "people.rates",
  "people.contacts",
  "equipment.costs",
];

export const DEFAULT_GRANTS: Record<MembershipRole, readonly Permission[]> = {
  owner: PERMISSION_KEYS,
  admin: PERMISSION_KEYS,
  accountant: ACCOUNTANT,
  estimator: ESTIMATOR,
  foreman: FOREMAN,
  worker: WORKER,
};

/** Grants a company may not change: the owner keeps everything, so nobody can lock the company out. */
export const LOCKED_ROLES: readonly MembershipRole[] = ["owner"];

/** Capabilities that give a worker money, pay or HR data — the settings screen asks before granting one. */
export const SENSITIVE_PERMISSIONS: readonly Permission[] = [
  "finance.view",
  "finance.manage",
  "finance.export",
  "finance.taxProfiles",
  "reports.custom",
  "costing.view",
  "people.rates",
  "hr.cases",
  "hr.payroll",
  "settings.roles",
];

export interface PermissionOverride {
  role: MembershipRole;
  permission: Permission;
  granted: boolean;
}

/**
 * A member's capabilities: their role's defaults with the company's overrides for that role applied,
 * plus whatever a custom role adds (its base roles' capabilities and its own extras) — the same
 * additive rule custom roles always had.
 */
export function effectivePermissions(
  role: MembershipRole,
  overrides: readonly PermissionOverride[] = [],
  customRole?: { baseRoles: readonly MembershipRole[]; extra: readonly string[] },
): Set<Permission> {
  const forRole = (r: MembershipRole) => {
    const granted = new Set<Permission>(DEFAULT_GRANTS[r]);
    if (LOCKED_ROLES.includes(r)) return granted;
    for (const o of overrides) {
      if (o.role !== r) continue;
      if (o.granted) granted.add(o.permission);
      else granted.delete(o.permission);
    }
    return granted;
  };
  const result = forRole(role);
  for (const base of customRole?.baseRoles ?? []) for (const p of forRole(base)) result.add(p);
  for (const p of customRole?.extra ?? []) if (p in PERMISSIONS) result.add(p as Permission);
  return result;
}

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}
