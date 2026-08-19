"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface ProjectMargin {
  projectId: string;
  projectName: string;
  budgetTotal: number;
  invoicedTotal: number;
  paidTotal: number;
  actualCost: number;
  margin: number;
  marginPercent: number | null;
}
interface TurnoverRow {
  materialId: string;
  code: string;
  name: string;
  unit: string;
  onHand: number;
  consumed: number;
  turnoverRatio: number | null;
  slowMoving: boolean;
}
interface AgingInvoice {
  invoiceId: string;
  number: string;
  clientName: string;
  total: number;
  outstanding: number;
  daysOverdue: number | null;
}
interface InvoiceAging {
  totalOutstanding: number;
  dso: number | null;
  buckets: { current: number; days1to30: number; days31to60: number; days61to90: number; days90plus: number };
  invoices: AgingInvoice[];
}
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

export default function ReportsPage() {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  const tt = useTranslations("team");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [margins, setMargins] = useState<ProjectMargin[] | null>(null);
  const [turnover, setTurnover] = useState<TurnoverRow[] | null>(null);
  const [aging, setAging] = useState<InvoiceAging | null>(null);
  const [workload, setWorkload] = useState<LaborCostReport | null>(null);
  const [workloadFrom, setWorkloadFrom] = useState(isoDaysAgo(30));
  const [workloadTo, setWorkloadTo] = useState(isoDaysAgo(0));

  useEffect(() => {
    apiFetch<ProjectMargin[]>("/reports/project-margins").then(setMargins);
    apiFetch<TurnoverRow[]>("/reports/warehouse-turnover").then(setTurnover);
    apiFetch<InvoiceAging>("/reports/invoice-aging").then(setAging);
  }, []);

  useEffect(() => {
    apiFetch<LaborCostReport>(
      `/team/labor-cost-report?from=${new Date(workloadFrom).toISOString()}&to=${new Date(workloadTo).toISOString()}`,
    ).then(setWorkload);
  }, [workloadFrom, workloadTo]);

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{t("projectMargins")}</h2>
      {!margins ? (
        <p className="text-gray-500">{tc("loading")}</p>
      ) : margins.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noProjects")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2">{t("project")}</th>
                <th className="text-right">{t("budget")}</th>
                <th className="text-right">{t("invoiced")}</th>
                <th className="text-right">{t("actualCost")}</th>
                <th className="text-right">{t("margin")}</th>
                <th className="text-right">{t("marginPercent")}</th>
              </tr>
            </thead>
            <tbody>
              {margins.map((m) => (
                <tr key={m.projectId} className="border-b border-gray-100">
                  <td className="py-2">
                    <a href={`/projects/${m.projectId}`} className="text-brand-700 hover:underline">
                      {m.projectName}
                    </a>
                  </td>
                  <td className="text-right">
                    {m.budgetTotal} {currency}
                  </td>
                  <td className="text-right">
                    {m.invoicedTotal} {currency}
                  </td>
                  <td className="text-right">
                    {m.actualCost} {currency}
                  </td>
                  <td className={`text-right ${m.margin < 0 ? "text-error-700" : "text-success-700"}`}>
                    {m.margin} {currency}
                  </td>
                  <td className={`text-right ${m.margin < 0 ? "text-error-700" : "text-success-700"}`}>
                    {m.marginPercent === null ? "—" : `${m.marginPercent}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700">{t("warehouseTurnover")}</h2>
      {!turnover ? (
        <p className="text-gray-500">{tc("loading")}</p>
      ) : turnover.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noTurnoverData")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2">{t("material")}</th>
                <th className="text-right">{t("onHand")}</th>
                <th className="text-right">{t("consumed")}</th>
                <th className="text-right">{t("turnoverRatio")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {turnover.map((row) => (
                <tr key={row.materialId} className="border-b border-gray-100">
                  <td className="py-2">
                    {row.name} <span className="text-gray-400">({row.code})</span>
                  </td>
                  <td className="text-right">
                    {row.onHand} {row.unit}
                  </td>
                  <td className="text-right">
                    {row.consumed} {row.unit}
                  </td>
                  <td className="text-right">{row.turnoverRatio ?? "—"}</td>
                  <td className="text-right">
                    {row.slowMoving && (
                      <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-700">
                        {t("slowMoving")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700">{t("invoiceAging")}</h2>
      {!aging ? (
        <p className="text-gray-500">{tc("loading")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="card">
              <div className="text-xs text-gray-500">{t("totalOutstanding")}</div>
              <div className="mt-1 text-lg font-semibold">
                {aging.totalOutstanding} {currency}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500">{t("dso")}</div>
              <div className="mt-1 text-lg font-semibold">{aging.dso ?? "—"}</div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500">{t("bucketCurrent")}</div>
              <div className="mt-1 text-sm font-semibold">
                {aging.buckets.current} {currency}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500">{t("bucket1to30")}</div>
              <div className="mt-1 text-sm font-semibold">
                {aging.buckets.days1to30} {currency}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500">{t("bucket31to90")}</div>
              <div className="mt-1 text-sm font-semibold">
                {round2(aging.buckets.days31to60 + aging.buckets.days61to90)} {currency}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500">{t("bucket90plus")}</div>
              <div className="mt-1 text-sm font-semibold text-error-700">
                {aging.buckets.days90plus} {currency}
              </div>
            </div>
          </div>

          {aging.invoices.length === 0 ? (
            <p className="mt-4 text-sm text-gray-400">{t("noOutstanding")}</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2">{t("invoiceNumber")}</th>
                    <th>{t("client")}</th>
                    <th className="text-right">{t("outstanding")}</th>
                    <th className="text-right">{t("daysOverdue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {aging.invoices.map((inv) => (
                    <tr key={inv.invoiceId} className="border-b border-gray-100">
                      <td className="py-2">
                        <a href={`/invoices/${inv.invoiceId}`} className="text-brand-700 hover:underline">
                          {inv.number}
                        </a>
                      </td>
                      <td>{inv.clientName}</td>
                      <td className="text-right">
                        {inv.outstanding} {currency}
                      </td>
                      <td className={`text-right ${inv.daysOverdue !== null && inv.daysOverdue > 0 ? "text-error-700" : ""}`}>
                        {inv.daysOverdue !== null && inv.daysOverdue > 0 ? inv.daysOverdue : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="mb-3 mt-10 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700">{t("teamWorkload")}</h2>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <input type="date" className="input w-auto" value={workloadFrom} onChange={(e) => setWorkloadFrom(e.target.value)} />
          <span>–</span>
          <input type="date" className="input w-auto" value={workloadTo} onChange={(e) => setWorkloadTo(e.target.value)} />
        </div>
      </div>
      {!workload ? (
        <p className="text-gray-500">{tc("loading")}</p>
      ) : workload.byWorker.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noWorkload")}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">{tc("name")}</th>
              <th>{tt("role")}</th>
              <th className="text-right">{tt("hours")}</th>
              <th className="text-right">{tt("cost")}</th>
            </tr>
          </thead>
          <tbody>
            {workload.byWorker.map((w) => (
              <tr key={w.workerId} className="border-b border-gray-100">
                <td className="py-2">
                  <a href={`/team/${w.workerId}`} className="text-brand-700 hover:underline">
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
    </AuthenticatedShell>
  );
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
