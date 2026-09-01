"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { clearToken, getToken } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { useSidebar } from "@/context/SidebarContext";
import { useTheme } from "@/context/ThemeContext";
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
  MoonIcon,
  PortfolioIcon,
  ProjectsIcon,
  PurchaseOrdersIcon,
  RateCatalogIcon,
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
  UserCircleIcon,
  WarehousesIcon,
} from "@/components/nav-icons";

const NAV_ITEMS = [
  { href: "/dashboard", key: "dashboard", icon: DashboardIcon },
  { href: "/portfolio", key: "portfolio", icon: PortfolioIcon },
  { href: "/projects", key: "projects", icon: ProjectsIcon },
  { href: "/clients", key: "clients", icon: ClientsIcon },
  { href: "/rate-catalog", key: "rateCatalog", icon: RateCatalogIcon },
  { href: "/warehouses", key: "warehouses", icon: WarehousesIcon },
  { href: "/equipment", key: "equipment", icon: EquipmentIcon },
  { href: "/resource-planning", key: "resourcePlanning", icon: ResourcePlanningIcon },
  { href: "/schedule", key: "schedule", icon: ScheduleIcon },
  { href: "/suppliers", key: "suppliers", icon: SuppliersIcon },
  { href: "/subcontractors", key: "subcontractors", icon: SubcontractorsIcon },
  { href: "/purchase-orders", key: "purchaseOrders", icon: PurchaseOrdersIcon },
  { href: "/invoices", key: "invoices", icon: InvoicesIcon },
  { href: "/expenses", key: "expenses", icon: ExpensesIcon },
  { href: "/bank-reconciliation", key: "bankReconciliation", icon: BankReconciliationIcon },
  { href: "/service-contracts", key: "serviceContracts", icon: ServiceContractsIcon },
  { href: "/insurance-claims", key: "insuranceClaims", icon: InsuranceClaimsIcon },
  { href: "/contracts", key: "contracts", icon: ContractsIcon },
  { href: "/team", key: "team", icon: TeamIcon },
  { href: "/documents", key: "documents", icon: DocumentsIcon },
  { href: "/templates", key: "templates", icon: TemplatesIcon },
  { href: "/reports", key: "reports", icon: ReportsIcon },
  { href: "/integrations", key: "integrations", icon: IntegrationsIcon },
  { href: "/settings", key: "settings", icon: SettingsIcon },
] as const;

export function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const tc = useTranslations("common");
  const router = useRouter();
  const { data, loading } = useMe();
  const { isExpanded, isMobileOpen } = useSidebar();

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  useEffect(() => {
    if (data && data.subscriptionStatus !== "active") router.replace("/billing/pending");
  }, [data, router]);

  if (loading || !data) {
    return <div className="flex min-h-screen items-center justify-center text-gray-500">{tc("loading")}</div>;
  }

  const mainMargin = isMobileOpen ? "ml-0" : isExpanded ? "lg:ml-[270px]" : "lg:ml-[90px]";

  return (
    <div className="min-h-screen xl:flex">
      <AppSidebar />
      <SidebarBackdrop />
      <div className={`flex-1 transition-all duration-300 ease-in-out ${mainMargin}`}>
        <AppHeader me={data} />
        <div className="mx-auto max-w-(--breakpoint-2xl) p-4 md:p-6">{children}</div>
      </div>
      <CommandPalette navItems={NAV_ITEMS} />
      <KeyboardShortcutsHelp />
    </div>
  );
}

function AppSidebar() {
  const tn = useTranslations("nav");
  const pathname = usePathname();
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const expanded = isExpanded || isHovered || isMobileOpen;

  return (
    <aside
      className={`fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-gray-200 bg-white px-4 transition-all duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-900 ${
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
        <span className={`mb-3 text-xs font-medium uppercase text-gray-400 ${expanded ? "" : "text-center"}`}>
          {expanded ? tn("menu") : "···"}
        </span>
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900 md:px-6">
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
            <ChevronDownIcon className={`text-gray-400 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
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
