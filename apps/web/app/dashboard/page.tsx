"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { TriagePanel } from "@/components/triage-panel";
import { DashboardWidgetsPanel } from "@/components/dashboard-widgets-panel";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { NpsTrendPanel } from "@/components/nps-trend-panel";
import { EnpsTrendPanel } from "@/components/enps-trend-panel";
import {
  ChevronRightIcon,
  ClientsIcon,
  FieldModeIcon,
  InvoicesIcon,
  ProjectsIcon,
  RateCatalogIcon,
  TrendDownIcon,
  TrendUpIcon,
} from "@/components/nav-icons";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface Overview {
  projectsTotal: number;
  estimates: { total: number; draft: number; approved: number };
  invoices: { total: number; totalValue: number; paidValue: number; outstandingValue: number };
  clients: { total: number; won: number };
  workersTotal: number;
  materials: { stockValue: number; lowStockCount: number };
}

interface PeriodComparison {
  changePercent: number | null;
}

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tn = useTranslations("nav");
  const { data } = useMe();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [periodComparison, setPeriodComparison] = useState<PeriodComparison | null>(null);

  useEffect(() => {
    apiFetch<Overview>("/reports/overview").then(setOverview);
    apiFetch<PeriodComparison>("/reports/period-comparison?months=1").then(setPeriodComparison);
  }, []);

  const currency = data?.company.currency ?? "";
  const revenueTrend =
    periodComparison?.changePercent !== null && periodComparison?.changePercent !== undefined
      ? { percent: periodComparison.changePercent, direction: periodComparison.changePercent >= 0 ? ("up" as const) : ("down" as const) }
      : undefined;

  const quickLinks = [
    { href: "/projects", label: tn("projects"), icon: ProjectsIcon },
    { href: "/clients", label: tn("clients"), icon: ClientsIcon },
    { href: "/rate-catalog", label: tn("rateCatalog"), icon: RateCatalogIcon },
    { href: "/invoices", label: tn("invoices"), icon: InvoicesIcon },
    { href: "/field", label: t("fieldMode"), icon: FieldModeIcon },
  ];

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{data ? t("welcome", { name: data.user.name }) : ""}</h1>

      {overview && (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t("projectsTotal")} value={overview.projectsTotal} />
          <StatCard
            label={t("estimatesTotal")}
            value={overview.estimates.total}
            sub={`${overview.estimates.approved} ${t("estimatesApproved")}`}
          />
          <StatCard
            label={t("invoicedTotal")}
            value={`${overview.invoices.totalValue} ${currency}`}
            sub={`${overview.invoices.outstandingValue} ${currency} ${t("outstandingTotal")}`}
            trend={revenueTrend}
          />
          <StatCard
            label={t("clientsTotal")}
            value={overview.clients.total}
            sub={`${overview.clients.won} ${t("clientsWon")}`}
          />
          <StatCard label={t("stockValue")} value={`${overview.materials.stockValue} ${currency}`} />
          {overview.materials.lowStockCount > 0 && (
            <StatCard label={t("lowStockCount")} value={overview.materials.lowStockCount} warn />
          )}
          <StatCard label={t("workersTotal")} value={overview.workersTotal} />
        </div>
      )}

      <div className="card mt-8 !p-0">
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {quickLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-gray-50 dark:hover:bg-gray-700/40"
            >
              <link.icon className="size-5 shrink-0 text-gray-400 dark:text-gray-500" />
              <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-200">{link.label}</span>
              <ChevronRightIcon className="size-4 shrink-0 text-gray-300 dark:text-gray-600" />
            </a>
          ))}
        </div>
      </div>

      <OnboardingChecklist />
      <TriagePanel />
      <NpsTrendPanel />
      <EnpsTrendPanel />
      <DashboardWidgetsPanel />
    </AuthenticatedShell>
  );
}

function StatCard({
  label,
  value,
  sub,
  warn,
  trend,
}: {
  label: string;
  value: string | number;
  sub?: string;
  warn?: boolean;
  trend?: { percent: number; direction: "up" | "down" };
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
        {trend && Math.round(trend.percent) !== 0 && (
          <span
            className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums ${
              trend.direction === "up"
                ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-500"
                : "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-500"
            }`}
          >
            {trend.direction === "up" ? <TrendUpIcon className="size-3" /> : <TrendDownIcon className="size-3" />}
            {Math.abs(Math.round(trend.percent))}%
          </span>
        )}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${warn ? "text-amber-600" : "text-gray-900 dark:text-gray-50"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</div>}
    </div>
  );
}
