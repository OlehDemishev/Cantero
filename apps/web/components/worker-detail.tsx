"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useApi } from "@/lib/use-api";
import { useMe } from "@/lib/use-me";
import { goBack } from "@/lib/back-navigation";
import { WorkerProfilePanel } from "@/components/worker-profile-panel";
import { WorkerCdlPanel } from "@/components/worker-cdl-panel";
import { WorkerCertificationsPanel } from "@/components/worker-certifications-panel";
import { WorkerPtoPanel } from "@/components/worker-pto-panel";
import { WorkerChecklistsPanel } from "@/components/worker-checklists-panel";
import { WorkerTrainingPanel } from "@/components/worker-training-panel";
import { WorkerBenefitsPanel } from "@/components/worker-benefits-panel";
import { WorkerToolCheckoutsPanel } from "@/components/worker-tool-checkouts-panel";
import { WorkerPerformancePanel } from "@/components/worker-performance-panel";
import { WorkerHrCasesPanel } from "@/components/worker-hr-cases-panel";
import { useCan } from "@/lib/permissions";
import { formatCurrency } from "@/lib/format-currency";

interface ProjectBreakdown {
  projectId: string;
  projectName: string;
  hours: number;
  cost: number;
}
interface Summary {
  worker: { name: string; role: string | null; active: boolean; ptoBalanceHours: string };
  totalHours: number;
  totalCost: number;
  byProject: ProjectBreakdown[];
}

export function WorkerDetail({ workerId }: { workerId: string }) {
  const t = useTranslations("team");
  const tc = useTranslations("common");
  const router = useRouter();
  const { data: me } = useMe();
  const can = useCan();
  const isManager = can("people.manage");

  const { data: summary = null, reload: reloadSummary } = useApi<Summary>(`/workers/${workerId}/summary`);

  function loadSummary() {
    void reloadSummary();
  }

  if (!summary) {
    return (
      <>
        <p className="text-fg-subtle">{tc("loading")}</p>
      </>
    );
  }

  const currency = me?.company.currency ?? "";

  return (
    <>
      <button onClick={() => goBack(router, "/team")} className="text-sm text-fg-subtle hover:underline">
        ← {t("title")}
      </button>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{summary.worker.name}</h1>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            summary.worker.active ? "bg-success-50 dark:bg-success-500/15 text-success-fg" : "bg-gray-100 dark:bg-gray-700 text-fg-subtle"
          }`}
        >
          {summary.worker.active ? t("active") : t("inactive")}
        </span>
      </div>
      <p className="text-sm text-fg-subtle">{summary.worker.role ?? "—"}</p>

      <div className="mt-4 flex gap-4 text-sm">
        <div className="card flex-1">
          <div className="text-xs text-fg-subtle">{t("totalHours")}</div>
          <div className="mt-1 text-lg font-semibold">{summary.totalHours}h</div>
        </div>
        <div className="card flex-1">
          <div className="text-xs text-fg-subtle">{t("totalCost")}</div>
          <div className="mt-1 text-lg font-semibold">
            {formatCurrency(summary.totalCost, currency)}
          </div>
        </div>
        <div className="card flex-1">
          <div className="text-xs text-fg-subtle">{t("ptoBalance")}</div>
          <div className="mt-1 text-lg font-semibold">{summary.worker.ptoBalanceHours}h</div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("profile")}</h2>
          {!isManager && (
            <div className="card flex flex-col gap-1.5 text-sm">
              <div>
                <span className="text-fg-subtle">{tc("name")}: </span>
                {summary.worker.name}
              </div>
              {summary.worker.role && (
                <div>
                  <span className="text-fg-subtle">{t("role")}: </span>
                  {summary.worker.role}
                </div>
              )}
              <p className="mt-1 text-xs text-fg-subtle">{t("managerOnlyHint")}</p>
            </div>
          )}
          {isManager && <WorkerProfilePanel workerId={workerId} currency={currency} onChanged={loadSummary} />}

          <WorkerCdlPanel workerId={workerId} />

          <WorkerCertificationsPanel workerId={workerId} />

          {isManager && <WorkerPtoPanel workerId={workerId} onChanged={loadSummary} />}

          <WorkerChecklistsPanel workerId={workerId} />

          <WorkerTrainingPanel workerId={workerId} />

          <WorkerBenefitsPanel workerId={workerId} />

          <WorkerToolCheckoutsPanel workerId={workerId} currency={currency} />

          <WorkerPerformancePanel workerId={workerId} />

          {can("hr.cases") && <WorkerHrCasesPanel workerId={workerId} />}
        </div>

        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("projectHistory")}</h2>
          {summary.byProject.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t("noProjectHistory")}</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                  <th className="py-2">{t("project")}</th>
                  <th className="text-right">{t("hours")}</th>
                  <th className="text-right">{t("cost")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.byProject.map((p) => (
                  <tr key={p.projectId} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2">
                      <Link href={`/projects/${p.projectId}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                        {p.projectName}
                      </Link>
                    </td>
                    <td className="text-right">{p.hours}h</td>
                    <td className="text-right">
                      {formatCurrency(p.cost, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
