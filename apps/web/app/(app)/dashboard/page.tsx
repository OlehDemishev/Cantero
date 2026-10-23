"use client";

import { useTranslations } from "next-intl";
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
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/lib/use-me";
import { useReportAccess } from "@/lib/report-access";
import { formatCurrency } from "@/lib/format-currency";

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
  // The company figures are for finance roles; everyone else's dashboard starts at the quick links.
  const canView = useReportAccess();
  const showFigures = canView("overview");
  const { data: overview, error: overviewError, reload: reloadOverview } = useApi<Overview>(showFigures ? "/reports/overview" : null);
  const { data: periodComparison } = useApi<PeriodComparison>(showFigures ? "/reports/period-comparison?months=1" : null);

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
    <>
      <h1 className="text-2xl font-semibold">{data ? t("welcome", { name: data.user.name }) : ""}</h1>

      {showFigures && !overview && (
        <div className="mt-8">
          {overviewError ? (
            <ErrorState error={overviewError} onRetry={reloadOverview} compact />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} variant="block" height="h-24" />
              ))}
            </div>
          )}
        </div>
      )}
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
            value={`${formatCurrency(overview.invoices.totalValue, currency)}`}
            sub={`${formatCurrency(overview.invoices.outstandingValue, currency)} ${t("outstandingTotal")}`}
            trend={revenueTrend}
          />
          <StatCard
            label={t("clientsTotal")}
            value={overview.clients.total}
            sub={`${overview.clients.won} ${t("clientsWon")}`}
          />
          <StatCard label={t("stockValue")} value={`${formatCurrency(overview.materials.stockValue, currency)}`} />
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
              <link.icon className="size-5 shrink-0 text-fg-subtle" />
              <span className="flex-1 text-sm font-medium text-fg-muted">{link.label}</span>
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
    </>
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
        <div className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</div>
        {trend && Math.round(trend.percent) !== 0 && (
          <span
            className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums ${
              trend.direction === "up"
                ? "bg-success-50 text-success-fg dark:bg-success-500/10"
                : "bg-error-50 text-danger-fg dark:bg-error-500/10"
            }`}
          >
            {trend.direction === "up" ? <TrendUpIcon className="size-3" /> : <TrendDownIcon className="size-3" />}
            {Math.abs(Math.round(trend.percent))}%
          </span>
        )}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${warn ? "text-amber-600" : "text-fg"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-fg-subtle">{sub}</div>}
    </div>
  );
}
