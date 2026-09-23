"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { useCan } from "@/lib/permissions";

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
  const canExportPayroll = useCan()("hr.payroll");

  const [workload, setWorkload] = useState<LaborCostReport | null>(null);
  const [workloadFrom, setWorkloadFrom] = useState(isoDaysAgo(30));
  const [workloadTo, setWorkloadTo] = useState(isoDaysAgo(0));

  useEffect(() => {
    apiFetch<LaborCostReport>(
      `/team/labor-cost-report?from=${new Date(workloadFrom).toISOString()}&to=${new Date(workloadTo).toISOString()}`,
    ).then(setWorkload);
  }, [workloadFrom, workloadTo]);

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

  return (
    <>
      <div className="mb-3 mt-10 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("teamWorkload")}</h2>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <input type="date" className="input w-auto" value={workloadFrom} onChange={(e) => setWorkloadFrom(e.target.value)} />
          <span>–</span>
          <input type="date" className="input w-auto" value={workloadTo} onChange={(e) => setWorkloadTo(e.target.value)} />
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
          <button onClick={downloadSafetyExport} className="btn-secondary px-3 py-1 text-xs">
            {t("downloadSafetyExport")}
          </button>
        </div>
      </div>
      {!workload ? (
        <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      ) : workload.byWorker.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noWorkload")}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
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
                  {w.cost} {currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
