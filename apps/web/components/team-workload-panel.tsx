"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { useCan } from "@/lib/permissions";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format-currency";

interface WorkloadRow {
  workerId: string;
  workerName: string;
  role: string | null;
  hours: number;
  cost: number;
}
interface LaborCostReport {
  totalHours: number;
  totalCost: number;
  byWorker: WorkloadRow[];
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function TeamWorkloadPanel({ currency }: { currency: string }) {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  const tt = useTranslations("team");
  const ta = useTranslations("a11y");
  const can = useCan();
  const canExportPayroll = can("hr.payroll");

  // Hours with their cost: for members who may see pay rates (people.rates).
  const canSee = can("people.rates");
  const [workloadFrom, setWorkloadFrom] = useState(isoDaysAgo(30));
  const [workloadTo, setWorkloadTo] = useState(isoDaysAgo(0));
  const { data: workload, error, reload } = useApi<LaborCostReport>(
    canSee ? `/team/labor-cost-report?from=${new Date(workloadFrom).toISOString()}&to=${new Date(workloadTo).toISOString()}` : null,
  );

  async function downloadPayrollExport() {
    const blob = await apiFetch<Blob>(
      `/team/labor-cost-report/payroll-export?from=${new Date(workloadFrom).toISOString()}&to=${new Date(workloadTo).toISOString()}`,
    );
    downloadBlob(blob, "payroll-export.csv");
  }

  async function downloadPayrollExportAdp() {
    const blob = await apiFetch<Blob>(
      `/team/labor-cost-report/payroll-export/adp?from=${new Date(workloadFrom).toISOString()}&to=${new Date(workloadTo).toISOString()}`,
    );
    downloadBlob(blob, "payroll-export-adp.csv");
  }

  async function downloadPayrollExportGusto() {
    const blob = await apiFetch<Blob>(
      `/team/labor-cost-report/payroll-export/gusto?from=${new Date(workloadFrom).toISOString()}&to=${new Date(workloadTo).toISOString()}`,
    );
    downloadBlob(blob, "payroll-export-gusto.csv");
  }

  async function downloadSafetyExport() {
    const blob = await apiFetch<Blob>("/safety/incidents/export");
    downloadBlob(blob, "incident-report-export.csv");
  }

  if (!canSee) return null;

  return (
    <>
      <div className="mb-3 mt-10 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg-muted">{t("teamWorkload")}</h2>
        <div className="flex items-center gap-2 text-xs text-fg-subtle">
          <input aria-label={ta("fromDate")} type="date" className="input w-auto" value={workloadFrom} onChange={(e) => setWorkloadFrom(e.target.value)} />
          <span>–</span>
          <input aria-label={ta("toDate")} type="date" className="input w-auto" value={workloadTo} onChange={(e) => setWorkloadTo(e.target.value)} />
          {canExportPayroll && (
            <>
              <button onClick={downloadPayrollExport} className="btn-secondary px-3 py-1 text-xs">
                {t("downloadPayrollExport")}
              </button>
              <button onClick={downloadPayrollExportAdp} className="btn-secondary px-3 py-1 text-xs">
                {t("downloadPayrollExportAdp")}
              </button>
              <button onClick={downloadPayrollExportGusto} className="btn-secondary px-3 py-1 text-xs">
                {t("downloadPayrollExportGusto")}
              </button>
            </>
          )}
          {can("site.manage") && (
            <button onClick={downloadSafetyExport} className="btn-secondary px-3 py-1 text-xs">
              {t("downloadSafetyExport")}
            </button>
          )}
        </div>
      </div>
      {!workload ? (
        error ? <ErrorState error={error} onRetry={reload} compact /> : <Skeleton variant="table" rows={4} columns={4} />
      ) : workload.byWorker.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noWorkload")}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
              <th className="py-2">{tc("name")}</th>
              <th>{tt("role")}</th>
              <th className="text-right">{tt("hours")}</th>
              <th className="text-right">{tt("cost")}</th>
            </tr>
          </thead>
          <tbody>
            {workload.byWorker.map((w) => (
              <tr key={w.workerId} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-2">
                  <a href={`/team/${w.workerId}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                    {w.workerName}
                  </a>
                </td>
                <td>{w.role ?? "—"}</td>
                <td className="text-right">{w.hours}h</td>
                <td className="text-right">
                  {formatCurrency(w.cost, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
