"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

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
}
interface Portfolio {
  projects: PortfolioProject[];
  summary: PortfolioSummary;
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

export default function PortfolioPage() {
  const t = useTranslations("portfolio");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [data, setData] = useState<Portfolio | null>(null);

  useEffect(() => {
    apiFetch<Portfolio>("/reports/portfolio").then(setData);
  }, []);

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>

      {!data ? (
        <p className="mt-8 text-gray-500">{tc("loading")}</p>
      ) : data.projects.length === 0 ? (
        <p className="mt-8 text-sm text-gray-400">{t("noProjects")}</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryCard label={t("projectsAtRisk")} value={`${data.summary.projectsAtRisk} / ${data.summary.projectsTotal}`} tone={data.summary.projectsAtRisk > 0 ? "error" : "success"} />
            <SummaryCard
              label={t("varianceTotal")}
              value={`${data.summary.varianceTotal} ${currency}`}
              tone={data.summary.varianceTotal < 0 ? "error" : "success"}
            />
            <SummaryCard label={t("openRfiTotal")} value={data.summary.openRfiTotal} />
            <SummaryCard label={t("openPunchListTotal")} value={data.summary.openPunchListTotal} />
            <SummaryCard label={t("pendingSubmittalTotal")} value={data.summary.pendingSubmittalTotal} />
            <SummaryCard label={t("incidentTotal")} value={data.summary.incidentTotal} />
            <SummaryCard label={t("overdueTaskTotal")} value={data.summary.overdueTaskTotal} />
          </div>

          <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700">{t("projects")}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">{t("project")}</th>
                  <th>{t("client")}</th>
                  <th className="text-right">{t("budget")}</th>
                  <th className="text-right">{t("actual")}</th>
                  <th className="text-right">{t("variance")}</th>
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
                    <td className="text-right">
                      {p.budgetTotal} {currency}
                    </td>
                    <td className="text-right">
                      {p.actualTotal} {currency}
                    </td>
                    <td className={`text-right ${p.variance < 0 ? "text-error-700" : "text-success-700"}`}>
                      {p.variance} {currency}
                    </td>
                    <td className="text-right">{p.openRfiCount || "—"}</td>
                    <td className="text-right">{p.openPunchListCount || "—"}</td>
                    <td className="text-right">{p.pendingSubmittalCount || "—"}</td>
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
      )}
    </AuthenticatedShell>
  );
}
