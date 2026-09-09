"use client";

import { useEffect, useRef, useState, type SVGProps } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { clearToken, getToken } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
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

const COLLAPSED_NAV_GROUPS_STORAGE_KEY = "cantero:collapsedNavGroups";

export function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const tc = useTranslations("common");
  const router = useRouter();
  const { data, loading, unauthorized } = useMe();
  const { isExpanded, isMobileOpen } = useSidebar();

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  useEffect(() => {
    // A stored token that the API now rejects (expired, or from a database that's since been
    // reset) leaves `getToken()` above satisfied forever — without this, the page sits on the
    // loading state indefinitely instead of bouncing back to sign-in.
    if (unauthorized) {
      clearToken();
      router.replace("/login");
    }
  }, [unauthorized, router]);

  useEffect(() => {
    if (data && data.subscriptionStatus !== "active") router.replace("/billing/pending");
  }, [data, router]);

  if (loading || !data) {
    return <div className="flex min-h-screen items-center justify-center text-gray-500 dark:text-gray-400">{tc("loading")}</div>;
  }

  const mainMargin = isMobileOpen ? "ml-0" : isExpanded ? "lg:ml-[270px]" : "lg:ml-[90px]";

  return (
    <div className="min-h-screen xl:flex">
      <AppSidebar hiddenNavItems={data.company.hiddenNavItems} />
      <SidebarBackdrop />
      <div className={`flex-1 transition-all duration-300 ease-in-out print:ml-0 ${mainMargin}`}>
        <AppHeader me={data} />
        <div className="mx-auto max-w-(--breakpoint-2xl) p-4 md:p-6 print:max-w-none print:p-0">{children}</div>
      </div>
      <CommandPalette navItems={NAV_ITEMS} />
      <KeyboardShortcutsHelp />
    </div>
  );
}

function AppSidebar({ hiddenNavItems }: { hiddenNavItems: string[] }) {
  const tn = useTranslations("nav");
  const pathname = usePathname();
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const expanded = isExpanded || isHovered || isMobileOpen;
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // A group that ends up with nothing left to show (every item in it hidden) doesn't render at
  // all — an empty section header would just be dead weight, not a useful "nothing here" signal.
  const hiddenSet = new Set(hiddenNavItems);
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !hiddenSet.has(item.key)),
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
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`flex h-16 items-center ${expanded ? "justify-start" : "justify-center"}`}>
        {expanded ? (
          <span className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Cantero</span>
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">
            C
          </span>
        )}
      </div>
      <nav className="flex flex-1 flex-col overflow-y-auto no-scrollbar">
        {!expanded && <span className="mb-3 text-center text-xs font-medium uppercase text-gray-400 dark:text-gray-500">···</span>}
        <div className="flex flex-col gap-1">
          {visibleGroups.map((group, i) => {
            const isCollapsed = collapsedGroups.has(group.key) && group.key !== activeGroupKey;
            return (
              <div key={group.key} className={i > 0 ? (expanded ? "mt-4" : "mt-2 border-t border-gray-100 pt-2 dark:border-gray-800") : ""}>
                {expanded && (
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className="mb-1 flex w-full items-center justify-between rounded px-1 py-1 text-xs font-medium uppercase tracking-wide text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
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

function SidebarBackdrop() {
  const { isMobileOpen, toggleMobileSidebar } = useSidebar();
  if (!isMobileOpen) return null;
  return <div className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden" onClick={toggleMobileSidebar} />;
}

function AppHeader({ me }: { me: NonNullable<ReturnType<typeof useMe>["data"]> }) {
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const ts = useTranslations("settings");
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleToggle() {
    if (window.innerWidth >= 1024) toggleSidebar();
    else toggleMobileSidebar();
  }

  function signOut() {
    clearToken();
    router.replace("/login");
  }

  const initial = me.user.name?.[0]?.toUpperCase() ?? "?";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 print:hidden dark:border-gray-800 dark:bg-gray-900 md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={handleToggle}
          aria-label="Toggle sidebar"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
        >
          {isMobileOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
        <span className="hidden text-sm font-medium text-gray-500 dark:text-gray-400 sm:block">{me.company.name}</span>
      </div>

      <div className="hidden flex-1 justify-center px-4 md:flex">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-2">
        <NotificationBell />

        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-white/5"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
              {initial}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">{me.user.name}</span>
            </span>
            <ChevronDownIcon className={`text-gray-400 dark:text-gray-500 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-theme-md dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-2 flex items-center gap-3 border-b border-gray-100 pb-3 dark:border-gray-800">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
                  {initial}
                </span>
                <div>
                  <div className="text-sm font-medium text-gray-800 dark:text-white/90">{me.user.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{me.user.email}</div>
                </div>
              </div>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
              >
                <UserCircleIcon className="text-gray-500 dark:text-gray-400" />
                {tn("settings")}
              </Link>
              <Link
                href="/help"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
              >
                <HelpIcon className="text-gray-500 dark:text-gray-400" />
                {tn("help")}
              </Link>
              <button
                onClick={signOut}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
              >
                <LogoutIcon className="text-gray-500 dark:text-gray-400" />
                {tc("signOut")}
              </button>
              <div className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-400 dark:border-gray-800">
                {ts(me.user.role as never)}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
