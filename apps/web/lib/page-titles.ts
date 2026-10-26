import { covers } from "./route-access";

/**
 * The browser-tab title of every page, as a message key ("namespace.key"): "<that> · Cantero".
 * Pages in the menu use their menu label, so the tab and the sidebar say the same thing; a detail
 * page (/projects/[id]) takes its section's. Paths follow route-access.ts's rules — an entry covers
 * itself and everything below it, the most specific one wins. A path with no entry is just "Cantero".
 */
export const PAGE_TITLES: Record<string, string> = {
  // The signed-in app (app/(app)) — the menu's own labels.
  "/dashboard": "nav.dashboard",
  "/portfolio": "nav.portfolio",
  "/open-items": "nav.openItems",
  "/projects": "nav.projects",
  "/schedule": "nav.schedule",
  "/resource-planning": "nav.resourcePlanning",
  "/clients": "nav.clients",
  "/rate-catalog": "nav.rateCatalog",
  "/contracts": "nav.contracts",
  "/service-contracts": "nav.serviceContracts",
  "/estimates": "nav.estimates",
  "/invoices": "nav.invoices",
  "/expenses": "nav.expenses",
  "/bank-reconciliation": "nav.bankReconciliation",
  "/insurance-claims": "nav.insuranceClaims",
  "/loans": "nav.loans",
  "/warehouses": "nav.warehouses",
  "/materials/units": "nav.unitsOfMeasure",
  "/materials/kits": "nav.stockKits",
  "/equipment": "nav.equipment",
  "/fleet": "nav.fleet",
  "/tool-crib": "nav.toolCrib",
  "/suppliers": "nav.suppliers",
  "/subcontractors": "nav.subcontractors",
  "/purchase-orders": "nav.purchaseOrders",
  "/team": "nav.team",
  "/benefits": "nav.benefits",
  "/recruiting": "nav.recruiting",
  "/performance": "nav.performance",
  "/hazmat": "nav.hazmat",
  "/documents": "nav.documents",
  "/drawings": "drawings.title",
  "/templates": "nav.templates",
  "/reports": "nav.reports",
  "/support-tickets": "nav.supportTickets",
  "/integrations": "nav.integrations",
  "/settings": "nav.settings",
  "/help": "nav.help",
  // Signed-in, full-screen pages outside the menu.
  "/field": "field.title",
  "/field/kiosk": "kiosk.title",
  "/onboarding": "pageTitle.onboarding",
  "/billing": "pageTitle.billing",
  // Signing in.
  "/login": "pageTitle.signIn",
  "/sso/callback": "pageTitle.signIn",
  "/signup": "pageTitle.signUp",
  "/forgot-password": "pageTitle.forgotPassword",
  "/reset-password": "pageTitle.resetPassword",
  "/accept-invite": "pageTitle.acceptInvite",
  // Portals and public links.
  "/portal": "pageTitle.clientPortal",
  "/subcontractor-portal": "pageTitle.subcontractorPortal",
  "/supplier-portal": "pageTitle.supplierPortal",
  "/subcontractor-profile": "pageTitle.subcontractorProfile",
  "/change-order": "pageTitle.changeOrder",
  "/company-coi": "pageTitle.certificateOfInsurance",
  "/contract": "pageTitle.contract",
  "/estimate": "pageTitle.estimate",
  "/lead": "pageTitle.quoteRequest",
  "/sign": "pageTitle.signDocument",
  "/survey": "pageTitle.survey",
  "/enps-survey": "pageTitle.survey",
  "/service-feedback": "pageTitle.feedback",
};

/** The message key of a path's title, or null for a plain "Cantero". */
export function pageTitleKey(path: string): string | null {
  const match = Object.keys(PAGE_TITLES)
    .filter((entry) => covers(entry, path))
    .sort((a, b) => b.length - a.length)[0];
  return match ? PAGE_TITLES[match] : null;
}
