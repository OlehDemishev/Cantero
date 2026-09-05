"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { TabNav, type TabNavItem } from "@/components/ui/tab-nav";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatCurrency } from "@/lib/format-currency";

// Leaflet touches `window` at module load time, so it must never be part of the server render.
const ProjectMapPanel = dynamic(() => import("@/components/project-map-panel").then((m) => m.ProjectMapPanel), { ssr: false });

interface PortfolioProject {
  id: string;
  name: string;
  clientName: string | null;
  budgetTotal: number;
  actualTotal: number;
  variance: number;
  openRfiCount: number;
  openPunchListCount: number;
  pendingSubmittalCount: number;
  incidentCount: number;
  overdueTaskCount: number;
  criticalTaskCount: number;
  overdueCriticalTaskCount: number;
  atRisk: boolean;
  billedToDate: number;
  fundedToDate: number;
  openDrawCount: number;
}
interface PortfolioSummary {
  projectsTotal: number;
  projectsAtRisk: number;
  budgetTotal: number;
  actualTotal: number;
  varianceTotal: number;
  openRfiTotal: number;
  openPunchListTotal: number;
  pendingSubmittalTotal: number;
  incidentTotal: number;
  overdueTaskTotal: number;
  billedToDateTotal: number;
  fundedToDateTotal: number;
  openDrawTotal: number;
}
interface Portfolio {
  projects: PortfolioProject[];
  summary: PortfolioSummary;
  currency: string;
}

function SummaryCard({ label, value, tone }: { label: string; value: string | number; tone?: "error" | "success" }) {
  return (
    <div className="card">
      <div className="text-xs text-gray-500">{label}</div>
      <div
        className={`mt-1 text-xl font-semibold ${tone === "error" ? "text-error-700" : tone === "success" ? "text-success-700" : "text-gray-900"}`}
      >
        {value}
      </div>
    </div>
  );
}

const PORTFOLIO_TAB_KEYS = ["overview", "map"] as const;

export default function PortfolioPage() {
  const t = useTranslations("portfolio");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";
  const money = (amount: number | string | null | undefined) => formatCurrency(amount, currency, me?.company.locale);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromParam = searchParams.get("tab");
  const activeTab = (tabFromParam && (PORTFOLIO_TAB_KEYS as readonly string[]).includes(tabFromParam) ? tabFromParam : "overview") as (typeof PORTFOLIO_TAB_KEYS)[number];
  const TABS: TabNavItem[] = PORTFOLIO_TAB_KEYS.map((key) => ({ key, label: t(`tab_${key}`) }));
  function setTab(key: string) {
    router.replace(`/portfolio?tab=${key}`, { scroll: false });
  }

  const [data, setData] = useState<Portfolio | null>(null);

  useEffect(() => {
    apiFetch<Portfolio>("/reports/portfolio").then(setData);
  }, []);

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>
      {data && <p className="mt-1 text-xs text-gray-400">{t("convertedToCurrency", { currency: data.currency })}</p>}

      <TabNav tabs={TABS} active={activeTab} onChange={setTab} />

      {activeTab === "map" && <ProjectMapPanel />}

      {activeTab === "overview" && (!data ? (
        <p className="mt-8 text-gray-500">{tc("loading")}</p>
      ) : data.projects.length === 0 ? (
        <p className="mt-8 text-sm text-gray-400">{t("noProjects")}</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryCard label={t("projectsAtRisk")} value={`${data.summary.projectsAtRisk} / ${data.summary.projectsTotal}`} tone={data.summary.projectsAtRisk > 0 ? "error" : "success"} />
            <SummaryCard
              label={t("varianceTotal")}
              value={money(data.summary.varianceTotal)}
              tone={data.summary.varianceTotal < 0 ? "error" : "success"}
            />
            <SummaryCard label={t("openRfiTotal")} value={data.summary.openRfiTotal} />
            <SummaryCard label={t("openPunchListTotal")} value={data.summary.openPunchListTotal} />
            <SummaryCard label={t("pendingSubmittalTotal")} value={data.summary.pendingSubmittalTotal} />
            <SummaryCard label={t("incidentTotal")} value={data.summary.incidentTotal} />
            <SummaryCard label={t("overdueTaskTotal")} value={data.summary.overdueTaskTotal} />
            <SummaryCard label={t("billedToDateTotal")} value={money(data.summary.billedToDateTotal)} />
            <SummaryCard label={t("fundedToDateTotal")} value={money(data.summary.fundedToDateTotal)} />
            <SummaryCard label={t("openDrawTotal")} value={data.summary.openDrawTotal} />
          </div>

          <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700">{t("projects")}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">{t("project")}</th>
                  <th>{t("client")}</th>
                  <th className="text-right">{t("budget")}</th>
                  <th className="text-right">{t("actual")}</th>
                  <th className="text-right">{t("variance")}</th>
                  <th className="text-right">{t("billedToDate")}</th>
                  <th className="text-right">{t("fundedToDate")}</th>
                  <th className="text-right">{t("openDraws")}</th>
                  <th className="text-right">{t("openRfis")}</th>
                  <th className="text-right">{t("openPunchList")}</th>
                  <th className="text-right">{t("pendingSubmittals")}</th>
                  <th className="text-right">{t("incidents")}</th>
                  <th className="text-right">{t("overdueTasks")}</th>
                  <th className="text-right">{t("critical")}</th>
                  <th className="text-right">{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.projects.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100">
                    <td className="py-2">
                      <a href={`/projects/${p.id}`} className="text-brand-700 hover:underline">
                        {p.name}
                      </a>
                    </td>
                    <td className="text-gray-500">{p.clientName ?? "—"}</td>
                    <td className="text-right">{money(p.budgetTotal)}</td>
                    <td className="text-right">{money(p.actualTotal)}</td>
                    <td className={`text-right ${p.variance < 0 ? "text-error-700" : "text-success-700"}`}>{money(p.variance)}</td>
                    <td className="text-right">{money(p.billedToDate)}</td>
                    <td className="text-right">{money(p.fundedToDate)}</td>
                    <td className="text-right">{p.openDrawCount || "—"}</td>
                    <td className="text-right">
                      {p.openRfiCount ? (
                        <a href={`/open-items?tab=rfis&projectId=${p.id}`} className="text-brand-700 hover:underline">
                          {p.openRfiCount}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-right">
                      {p.openPunchListCount ? (
                        <a href={`/open-items?tab=punchList&projectId=${p.id}`} className="text-brand-700 hover:underline">
                          {p.openPunchListCount}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-right">
                      {p.pendingSubmittalCount ? (
                        <a href={`/open-items?tab=submittals&projectId=${p.id}`} className="text-brand-700 hover:underline">
                          {p.pendingSubmittalCount}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-right">{p.incidentCount || "—"}</td>
                    <td className="text-right">{p.overdueTaskCount || "—"}</td>
                    <td className="text-right">{p.criticalTaskCount || "—"}</td>
                    <td className="text-right">
                      {p.atRisk ? (
                        <span className="rounded-full bg-error-50 px-2 py-0.5 text-xs font-medium text-error-700">{t("atRisk")}</span>
                      ) : (
                        <span className="rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700">{t("onTrack")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ))}
    </AuthenticatedShell>
  );
}
