"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";
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
  const isManager = me?.user.role === "owner" || me?.user.role === "admin";

  const [summary, setSummary] = useState<Summary | null>(null);

  function loadSummary() {
    apiFetch<Summary>(`/workers/${workerId}/summary`).then(setSummary);
  }

  useEffect(loadSummary, [workerId]);

  if (!summary) {
    return (
      <AuthenticatedShell>
        <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      </AuthenticatedShell>
    );
  }

  const currency = me?.company.currency ?? "";

  return (
    <AuthenticatedShell>
      <button onClick={() => goBack(router, "/team")} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
        ← {t("title")}
      </button>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{summary.worker.name}</h1>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            summary.worker.active ? "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
          }`}
        >
          {summary.worker.active ? t("active") : t("inactive")}
        </span>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{summary.worker.role ?? "—"}</p>

      <div className="mt-4 flex gap-4 text-sm">
        <div className="card flex-1">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t("totalHours")}</div>
          <div className="mt-1 text-lg font-semibold">{summary.totalHours}h</div>
        </div>
        <div className="card flex-1">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t("totalCost")}</div>
          <div className="mt-1 text-lg font-semibold">
            {summary.totalCost} {currency}
          </div>
        </div>
        <div className="card flex-1">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t("ptoBalance")}</div>
          <div className="mt-1 text-lg font-semibold">{summary.worker.ptoBalanceHours}h</div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("profile")}</h2>
          {!isManager && (
            <div className="card flex flex-col gap-1.5 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400">{tc("name")}: </span>
                {summary.worker.name}
              </div>
              {summary.worker.role && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">{t("role")}: </span>
                  {summary.worker.role}
                </div>
              )}
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t("managerOnlyHint")}</p>
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

          {isManager && <WorkerHrCasesPanel workerId={workerId} />}
        </div>

        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("projectHistory")}</h2>
          {summary.byProject.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("noProjectHistory")}</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
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
                      {p.cost} {currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </AuthenticatedShell>
  );
}
