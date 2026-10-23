"use client";

import { useEffect, useRef, useState, type SVGProps } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { clearToken, signOutSession } from "@/lib/api-client";
import { useMe, type MeResponse } from "@/lib/use-me";
import { OfflineOthersNotice } from "@/components/offline-others-notice";
import { useCan } from "@/lib/permissions";
import { permissionsFor } from "@/lib/route-access";
import { useSidebar } from "@/context/SidebarContext";
import { useTheme } from "@/context/ThemeContext";
import { resetStateInEffect } from "@/lib/effect-reset";
import { NotificationBell } from "@/components/notification-bell";
import { GlobalSearch } from "@/components/global-search";
import { CommandPalette } from "@/components/command-palette";
import { KeyboardShortcutsHelp } from "@/components/keyboard-shortcuts-help";
import {
  BankReconciliationIcon,
  ChevronDownIcon,
  ClientsIcon,
  CloseIcon,
  ContractsIcon,
  DashboardIcon,
  DocumentsIcon,
  EquipmentIcon,
  ExpensesIcon,
  HelpIcon,
  InsuranceClaimsIcon,
  IntegrationsIcon,
  InvoicesIcon,
  LogoutIcon,
  MenuIcon,
  BenefitsIcon,
  FleetIcon,
  HazmatIcon,
  LoansIcon,
  MoonIcon,
  OpenItemsIcon,
  PerformanceIcon,
  PortfolioIcon,
  ProjectsIcon,
  PurchaseOrdersIcon,
  RateCatalogIcon,
  RecruitingIcon,
  SupportTicketsIcon,
  ReportsIcon,
  ResourcePlanningIcon,
  ScheduleIcon,
  ServiceContractsIcon,
  SettingsIcon,
  SubcontractorsIcon,
  SunIcon,
  SuppliersIcon,
  TeamIcon,
  TemplatesIcon,
  ToolCribIcon,
  UserCircleIcon,
  WarehousesIcon,
  UnitsOfMeasureIcon,
  StockKitsIcon,
} from "@/components/nav-icons";

interface NavItem {
  href: string;
  key: string;
  icon: (props: SVGProps<SVGSVGElement>) => React.JSX.Element;
}

/** Grouped instead of one flat 33-item list: a menu a user can't scan at a glance is a navigation
 * problem, not a cosmetic one. Each group can be collapsed independently (state persisted per
 * browser in localStorage) — see AppSidebar. Order and membership here is what actually renders;
 * NAV_ITEMS below is just this flattened, for the command palette and active-route matching. */
/** Exported so NavItemsSettingsPanel (Settings → Company) can render the exact same grouping to
 * let an admin hide items — one source of truth for "what nav sections/items exist" instead of a
 * second hand-maintained list that could drift out of sync with the sidebar itself. */
export const NAV_GROUPS: { key: string; items: NavItem[] }[] = [
  {
    key: "overview",
    items: [
      { href: "/dashboard", key: "dashboard", icon: DashboardIcon },
      { href: "/portfolio", key: "portfolio", icon: PortfolioIcon },
      { href: "/open-items", key: "openItems", icon: OpenItemsIcon },
    ],
  },
  {
    key: "projects",
    items: [
      { href: "/projects", key: "projects", icon: ProjectsIcon },
      { href: "/schedule", key: "schedule", icon: ScheduleIcon },
      { href: "/resource-planning", key: "resourcePlanning", icon: ResourcePlanningIcon },
    ],
  },
  {
    key: "clients",
    items: [
      { href: "/clients", key: "clients", icon: ClientsIcon },
      { href: "/rate-catalog", key: "rateCatalog", icon: RateCatalogIcon },
      { href: "/contracts", key: "contracts", icon: ContractsIcon },
      { href: "/service-contracts", key: "serviceContracts", icon: ServiceContractsIcon },
    ],
  },
  {
    key: "finance",
    items: [
      { href: "/invoices", key: "invoices", icon: InvoicesIcon },
      { href: "/expenses", key: "expenses", icon: ExpensesIcon },
      { href: "/bank-reconciliation", key: "bankReconciliation", icon: BankReconciliationIcon },
      { href: "/insurance-claims", key: "insuranceClaims", icon: InsuranceClaimsIcon },
      { href: "/loans", key: "loans", icon: LoansIcon },
    ],
  },
  {
    key: "procurement",
    items: [
      { href: "/warehouses", key: "warehouses", icon: WarehousesIcon },
      { href: "/materials/units", key: "unitsOfMeasure", icon: UnitsOfMeasureIcon },
      { href: "/materials/kits", key: "stockKits", icon: StockKitsIcon },
      { href: "/equipment", key: "equipment", icon: EquipmentIcon },
      { href: "/fleet", key: "fleet", icon: FleetIcon },
      { href: "/tool-crib", key: "toolCrib", icon: ToolCribIcon },
      { href: "/suppliers", key: "suppliers", icon: SuppliersIcon },
      { href: "/subcontractors", key: "subcontractors", icon: SubcontractorsIcon },
      { href: "/purchase-orders", key: "purchaseOrders", icon: PurchaseOrdersIcon },
    ],
  },
  {
    key: "people",
    items: [
      { href: "/team", key: "team", icon: TeamIcon },
      { href: "/benefits", key: "benefits", icon: BenefitsIcon },
      { href: "/recruiting", key: "recruiting", icon: RecruitingIcon },
      { href: "/performance", key: "performance", icon: PerformanceIcon },
      { href: "/hazmat", key: "hazmat", icon: HazmatIcon },
    ],
  },
  {
    key: "documents",
    items: [
      { href: "/documents", key: "documents", icon: DocumentsIcon },
      { href: "/templates", key: "templates", icon: TemplatesIcon },
      { href: "/reports", key: "reports", icon: ReportsIcon },
      { href: "/support-tickets", key: "supportTickets", icon: SupportTicketsIcon },
    ],
  },
  {
    key: "system",
    items: [
      { href: "/integrations", key: "integrations", icon: IntegrationsIcon },
      { href: "/settings", key: "settings", icon: SettingsIcon },
    ],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

/** Menu items this member may open: not hidden by the company, and covered by their permissions. */
function useVisibleNavItems(hiddenNavItems: string[]): (item: NavItem) => boolean {
  const can = useCan();
  const hidden = new Set(hiddenNavItems);
  // The same table decides the menu and whether a page opens (lib/route-access.ts).
  return (item) => {
    const needs = permissionsFor(item.href);
    return !hidden.has(item.key) && (!needs || needs.some(can));
  };
}

const COLLAPSED_NAV_GROUPS_STORAGE_KEY = "cantero:collapsedNavGroups";

/**
 * The signed-in app's frame — menu, header, command palette — rendered once by app/(app)/layout.tsx
 * around every page in it, so moving between pages swaps only the content. The frame draws at once;
 * the page itself waits for /me (MeProvider) and an active subscription, so a signed-out visit goes
 * to /login without any of the page's own requests going out.
 */
export function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const tc = useTranslations("common");
  const router = useRouter();
  const { data, unauthorized } = useMe();
  const { isExpanded, isMobileOpen } = useSidebar();

  useEffect(() => {
    // No stored token, or one the API now rejects (expired, or from a database that's since been
    // reset): without this the content would sit on its loading state instead of going to sign-in.
    if (unauthorized) {
      clearToken();
      router.replace("/login");
    }
  }, [unauthorized, router]);

  useEffect(() => {
    if (data && data.subscriptionStatus !== "active") router.replace("/billing/pending");
  }, [data, router]);

  const isNavItemVisible = useVisibleNavItems(data?.company.hiddenNavItems ?? []);
  const ready = data?.subscriptionStatus === "active";

  const mainMargin = isMobileOpen ? "ml-0" : isExpanded ? "lg:ml-[270px]" : "lg:ml-[90px]";

  return (
    <div className="min-h-screen xl:flex">
      <AppSidebar hiddenNavItems={data?.company.hiddenNavItems ?? null} />
      <SidebarBackdrop />
      <div className={`flex-1 transition-all duration-300 ease-in-out print:ml-0 ${mainMargin}`}>
        <AppHeader me={data} />
        <div className="mx-auto max-w-(--breakpoint-2xl) p-4 md:p-6 print:max-w-none print:p-0">
          {ready ? (
            <>
              <OfflineOthersNotice />
              {children}
            </>
          ) : (
            <ContentSkeleton label={tc("loading")} />
          )}
        </div>
      </div>
      {ready && <CommandPalette navItems={NAV_ITEMS.filter(isNavItemVisible)} />}
      <KeyboardShortcutsHelp />
    </div>
  );
}

/** Stands in for the page while /me loads — the frame around it is already there. */
function ContentSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" className="animate-pulse">
      <span className="sr-only">{label}</span>
      <div className="mb-6 h-8 w-56 max-w-full rounded-lg bg-gray-200 dark:bg-gray-800" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-28 rounded-2xl bg-gray-200 dark:bg-gray-800" />
        <div className="h-28 rounded-2xl bg-gray-200 dark:bg-gray-800" />
        <div className="hidden h-28 rounded-2xl bg-gray-200 dark:bg-gray-800 lg:block" />
      </div>
      <div className="mt-6 h-72 rounded-2xl bg-gray-200 dark:bg-gray-800" />
    </div>
  );
}

/** `hiddenNavItems` is null while /me loads: the menu then shows placeholders rather than items the
 * member may turn out not to have. */
function AppSidebar({ hiddenNavItems }: { hiddenNavItems: string[] | null }) {
  const tn = useTranslations("nav");
  const pathname = usePathname();
  const { isExpanded, isMobile, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const expanded = isExpanded || isHovered || isMobileOpen;
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // A group that ends up with nothing left to show (every item in it hidden) doesn't render at
  // all — an empty section header would just be dead weight, not a useful "nothing here" signal.
  const isVisible = useVisibleNavItems(hiddenNavItems ?? []);
  const visibleGroups = (hiddenNavItems ? NAV_GROUPS : []).map((group) => ({
    ...group,
    items: group.items.filter(isVisible),
  })).filter((group) => group.items.length > 0);

  // Read after mount, not in initial state — localStorage isn't available during SSR, and every
  // group renders expanded on the first paint either way, so there's nothing to flash.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_NAV_GROUPS_STORAGE_KEY);
      if (stored) resetStateInEffect(() => setCollapsedGroups(new Set(JSON.parse(stored))));
    } catch {
      // Private browsing / storage disabled — every group just stays expanded.
    }
  }, []);

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(COLLAPSED_NAV_GROUPS_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Ignore — the toggle still works for this page view, just won't persist.
      }
      return next;
    });
  }

  // A group the user collapsed still opens back up automatically once they're actually on one of
  // its pages — collapsing a section you don't use shouldn't also hide where you currently are.
  const activeGroupKey = visibleGroups.find((g) => g.items.some((item) => pathname.startsWith(item.href)))?.key;

  return (
    <aside
      className={`fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-gray-200 bg-white px-4 transition-all duration-300 ease-in-out print:hidden dark:border-gray-800 dark:bg-gray-900 ${
        expanded ? "w-[270px]" : "w-[90px]"
      } ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      // Off-canvas on a phone: out of the Tab order and the accessibility tree, not just out of sight.
      inert={isMobile && !isMobileOpen}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`flex h-16 items-center ${expanded ? "justify-start" : "justify-center"}`}>
        {expanded ? (
          <span className="text-lg font-semibold tracking-tight text-fg">Cantero</span>
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">
            C
          </span>
        )}
      </div>
      <nav className="flex flex-1 flex-col overflow-y-auto no-scrollbar">
        {!expanded && <span className="mb-3 text-center text-xs font-medium uppercase text-fg-subtle">···</span>}
        {!hiddenNavItems && <NavSkeleton expanded={expanded} />}
        <div className="flex flex-col gap-1">
          {visibleGroups.map((group, i) => {
            const isCollapsed = collapsedGroups.has(group.key) && group.key !== activeGroupKey;
            return (
              <div key={group.key} className={i > 0 ? (expanded ? "mt-4" : "mt-2 border-t border-gray-100 pt-2 dark:border-gray-800") : ""}>
                {expanded && (
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className="mb-1 flex w-full items-center justify-between rounded px-1 py-1 text-xs font-medium uppercase tracking-wide text-fg-subtle hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {tn(`group_${group.key}`)}
                    <ChevronDownIcon className={`transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                  </button>
                )}
                {!isCollapsed && (
                  <ul className="flex flex-col gap-1">
                    {group.items.map((item) => {
                      const active = pathname.startsWith(item.href);
                      const Icon = item.icon;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={`group menu-item ${active ? "menu-item-active" : "menu-item-inactive"} ${
                              expanded ? "" : "justify-center"
                            }`}
                          >
                            <Icon className={active ? "menu-item-icon-active" : "menu-item-icon-inactive"} />
                            {expanded && <span>{tn(item.key)}</span>}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

function NavSkeleton({ expanded }: { expanded: boolean }) {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-3 pt-1">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className={`h-9 rounded-lg bg-gray-100 dark:bg-gray-800 ${expanded ? "" : "mx-auto w-10"}`} />
      ))}
    </div>
  );
}

function SidebarBackdrop() {
  const { isMobileOpen, toggleMobileSidebar } = useSidebar();
  if (!isMobileOpen) return null;
  return <div className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden" onClick={toggleMobileSidebar} />;
}

/** `me` is null while /me loads: the header draws at once, with placeholders where the company and
 * the person go, and the parts that ask the API themselves (search, notifications) wait for it. */
function AppHeader({ me }: { me: MeResponse | null }) {
  const { theme, toggleTheme } = useTheme();
  const { isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const tl = useTranslations("labels");

  function handleToggle() {
    if (window.innerWidth >= 1024) toggleSidebar();
    else toggleMobileSidebar();
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 print:hidden dark:border-gray-800 dark:bg-gray-900 md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={handleToggle}
          aria-label={tl("toggleSidebar")}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-fg-subtle hover:bg-gray-100 dark:hover:bg-white/5"
        >
          {isMobileOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
        {me ? (
          <span className="hidden text-sm font-medium text-fg-subtle sm:block">{me.company.name}</span>
        ) : (
          <span aria-hidden="true" className="hidden h-4 w-32 animate-pulse rounded bg-gray-100 dark:bg-gray-800 sm:block" />
        )}
      </div>

      <div className="hidden flex-1 justify-center px-4 md:flex">{me && <GlobalSearch />}</div>

      <div className="flex items-center gap-2">
        {me ? <NotificationBell /> : <span aria-hidden="true" className="h-10 w-10" />}

        <button
          onClick={toggleTheme}
          aria-label={tl("toggleTheme")}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-fg-subtle hover:bg-gray-100 dark:hover:bg-white/5"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>

        {me ? (
          <UserMenu me={me} />
        ) : (
          <span aria-hidden="true" className="mx-2 my-1.5 h-9 w-9 animate-pulse rounded-full bg-gray-100 dark:bg-gray-800" />
        )}
      </div>
    </header>
  );
}

function UserMenu({ me }: { me: MeResponse }) {
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const ts = useTranslations("settings");
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function signOut() {
    await signOutSession();
    router.replace("/login");
  }

  const initial = me.user.name?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-white/5"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
          {initial}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium text-fg-muted">{me.user.name}</span>
        </span>
        <ChevronDownIcon className={`text-fg-subtle transition-transform ${menuOpen ? "rotate-180" : ""}`} />
      </button>

      {menuOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-theme-md dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-2 flex items-center gap-3 border-b border-gray-100 pb-3 dark:border-gray-800">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
              {initial}
            </span>
            <div>
              <div className="text-sm font-medium text-fg">{me.user.name}</div>
              <div className="text-xs text-fg-subtle">{me.user.email}</div>
            </div>
          </div>
          <Link
            href="/settings"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-fg-muted hover:bg-gray-100 dark:hover:bg-white/5"
          >
            <UserCircleIcon className="text-fg-subtle" />
            {tn("settings")}
          </Link>
          <Link
            href="/help"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-fg-muted hover:bg-gray-100 dark:hover:bg-white/5"
          >
            <HelpIcon className="text-fg-subtle" />
            {tn("help")}
          </Link>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-fg-muted hover:bg-gray-100 dark:hover:bg-white/5"
          >
            <LogoutIcon className="text-fg-subtle" />
            {tc("signOut")}
          </button>
          <div className="mt-2 border-t border-gray-100 pt-2 text-xs text-fg-subtle dark:border-gray-800">
            {ts(me.user.role as never)}
          </div>
        </div>
      )}
    </div>
  );
}
