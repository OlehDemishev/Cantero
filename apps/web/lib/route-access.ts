import type { Permission } from "@cantero/shared";

/**
 * Who may open each page of the app. A page listed in RESTRICTED needs one of its permissions (the
 * same ones its API asks for), so a member who follows a link without it gets the "no access" screen
 * instead of a page of empty panels; the menu hides the same pages. OPEN pages are for every member
 * (their panels check their own permissions), PUBLIC ones don't need a sign-in at all.
 *
 * A path covers itself and everything below it ("/clients" is also "/clients/[id]"); a trailing "/*"
 * covers only what is below it. The e2e suite (route-access.spec.ts) checks that every page in app/
 * is in exactly one of the lists, so a new page can't slip through without a decision.
 */
export const RESTRICTED: Record<string, readonly Permission[]> = {
  "/schedule": ["site.manage"],
  "/resource-planning": ["site.manage"],
  "/clients": ["clients.view"],
  "/contracts": ["contracts.view"],
  "/service-contracts": ["contracts.view"],
  "/estimates": ["estimates.view"],
  "/invoices": ["finance.view"],
  "/bank-reconciliation": ["finance.view"],
  "/insurance-claims": ["finance.view"],
  "/loans": ["hr.payroll"],
  "/materials/kits": ["site.manage"],
  "/equipment": ["site.manage"],
  "/fleet": ["site.manage"],
  "/suppliers": ["purchasing.view"],
  "/subcontractors": ["subcontractors.view"],
  "/purchase-orders": ["purchasing.view"],
  "/benefits": ["hr.payroll"],
  "/recruiting": ["hr.cases"],
  "/performance": ["hr.cases"],
  "/hazmat": ["site.manage"],
  "/support-tickets": ["site.manage"],
  "/portfolio": ["costing.view"],
  "/integrations": ["finance.manage", "settings.integrations"],
  "/onboarding": ["settings.company"],
  // A worker's page shows their hours and cost; the directory itself (/team) is for everyone.
  "/team/*": ["people.rates"],
};

export const OPEN: readonly string[] = [
  "/dashboard",
  "/documents",
  "/drawings",
  "/expenses",
  "/field",
  "/help",
  "/materials/units",
  "/open-items",
  "/projects",
  "/rate-catalog",
  "/reports",
  "/settings",
  "/team",
  "/templates",
  "/tool-crib",
  "/warehouses",
  "/billing",
];

export const PUBLIC: readonly string[] = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
  "/sso/callback",
  "/portal",
  "/subcontractor-portal",
  "/supplier-portal",
  "/subcontractor-profile",
  "/change-order",
  "/company-coi",
  "/contract",
  "/estimate",
  "/lead",
  "/sign",
  "/survey",
  "/enps-survey",
  "/service-feedback",
];

/** Whether a route entry covers this path (see the rules above). */
export function covers(entry: string, path: string): boolean {
  if (entry.endsWith("/*")) return path.startsWith(entry.slice(0, -1));
  if (entry === "/") return path === "/";
  return path === entry || path.startsWith(`${entry}/`);
}

/** The permissions (any one will do) a path needs, or null when it is open to every member. */
export function permissionsFor(path: string): readonly Permission[] | null {
  // The most specific entry wins, so "/team/*" decides a worker's page and "/team" the directory.
  const match = Object.keys(RESTRICTED)
    .filter((entry) => covers(entry, path))
    .sort((a, b) => b.length - a.length)[0];
  return match ? RESTRICTED[match] : null;
}
