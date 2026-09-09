"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { TriagePanel } from "@/components/triage-panel";
import { DashboardWidgetsPanel } from "@/components/dashboard-widgets-panel";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { NpsTrendPanel } from "@/components/nps-trend-panel";
import { EnpsTrendPanel } from "@/components/enps-trend-panel";
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

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tn = useTranslations("nav");
  const { data } = useMe();
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    apiFetch<Overview>("/reports/overview").then(setOverview);
  }, []);

  const currency = data?.company.currency ?? "";

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

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard href="/projects" label={tn("projects")} />
        <SummaryCard href="/clients" label={tn("clients")} />
        <SummaryCard href="/rate-catalog" label={tn("rateCatalog")} />
        <SummaryCard href="/invoices" label={tn("invoices")} />
        <SummaryCard href="/field" label={t("fieldMode")} />
      </div>

      <OnboardingChecklist />
      <TriagePanel />
      <NpsTrendPanel />
      <EnpsTrendPanel />
      <DashboardWidgetsPanel />
    </AuthenticatedShell>
  );
}

function StatCard({ label, value, sub, warn }: { label: string; value: string | number; sub?: string; warn?: boolean }) {
  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${warn ? "text-amber-600" : "text-gray-900 dark:text-gray-50"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</div>}
    </div>
  );
}

function SummaryCard({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="card block hover:border-gray-400">
      <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-2 text-gray-900 dark:text-gray-50">→</div>
    </a>
  );
}
