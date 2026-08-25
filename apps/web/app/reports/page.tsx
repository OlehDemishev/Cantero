"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  SCHEDULED_REPORT_FREQUENCIES,
  SCHEDULED_REPORT_TYPES,
  type ScheduledReportFrequency,
  type ScheduledReportType,
} from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { CustomReportsPanel } from "@/components/custom-reports-panel";
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
interface EacRow {
  projectId: string;
  projectName: string;
  contractValue: number;
  budgetedCost: number;
  actualCost: number;
  percentComplete: number;
  earnedValue: number;
  costPerformanceIndex: number | null;
  estimateAtCompletion: number;
  varianceAtCompletion: number;
  budgetedMarginPercent: number | null;
  projectedMarginPercent: number | null;
  marginErosionPercent: number | null;
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
interface CashFlowWeek {
  weekStart: string;
  weekEnd: string;
  inflow: number;
  outflow: number;
  net: number;
  cumulativeNet: number;
}
interface CashFlowForecast {
  windowWeeks: number;
  unscheduledInflow: number;
  unscheduledOutflow: number;
  weeks: CashFlowWeek[];
  totals: { inflow: number; outflow: number; net: number };
}

interface ScheduledReport {
  id: string;
  name: string;
  reportType: ScheduledReportType;
  frequency: ScheduledReportFrequency;
  recipientEmails: string[];
  active: boolean;
  nextRunAt: string;
  lastSentAt: string | null;
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
  const [eac, setEac] = useState<EacRow[] | null>(null);
  const [turnover, setTurnover] = useState<TurnoverRow[] | null>(null);
  const [aging, setAging] = useState<InvoiceAging | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowForecast | null>(null);
  const [workload, setWorkload] = useState<LaborCostReport | null>(null);
  const [workloadFrom, setWorkloadFrom] = useState(isoDaysAgo(30));
  const [workloadTo, setWorkloadTo] = useState(isoDaysAgo(0));
  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[] | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    name: "",
    reportType: "overview" as ScheduledReportType,
    frequency: "weekly" as ScheduledReportFrequency,
    recipientEmails: "",
  });
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [sentNowId, setSentNowId] = useState<string | null>(null);

  function loadScheduledReports() {
    apiFetch<ScheduledReport[]>("/scheduled-reports").then(setScheduledReports);
  }

  async function createScheduledReport(e: React.FormEvent) {
    e.preventDefault();
    const recipientEmails = scheduleForm.recipientEmails
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (recipientEmails.length === 0) return;
    setScheduleBusy(true);
    try {
      await apiFetch("/scheduled-reports", {
        method: "POST",
        body: JSON.stringify({ name: scheduleForm.name, reportType: scheduleForm.reportType, frequency: scheduleForm.frequency, recipientEmails }),
      });
      setScheduleForm({ name: "", reportType: "overview", frequency: "weekly", recipientEmails: "" });
      loadScheduledReports();
    } finally {
      setScheduleBusy(false);
    }
  }

  async function toggleScheduledReportActive(report: ScheduledReport) {
    await apiFetch(`/scheduled-reports/${report.id}`, { method: "PATCH", body: JSON.stringify({ active: !report.active }) });
    loadScheduledReports();
  }

  async function deleteScheduledReport(id: string) {
    await apiFetch(`/scheduled-reports/${id}`, { method: "DELETE" });
    loadScheduledReports();
  }

  async function sendScheduledReportNow(id: string) {
    setSentNowId(null);
    await apiFetch(`/scheduled-reports/${id}/send-now`, { method: "POST" });
    setSentNowId(id);
  }

  useEffect(loadScheduledReports, []);

  useEffect(() => {
    apiFetch<ProjectMargin[]>("/reports/project-margins").then(setMargins);
    apiFetch<EacRow[]>("/reports/estimate-at-completion").then(setEac);
    apiFetch<TurnoverRow[]>("/reports/warehouse-turnover").then(setTurnover);
    apiFetch<InvoiceAging>("/reports/invoice-aging").then(setAging);
    apiFetch<CashFlowForecast>("/reports/cash-flow-forecast").then(setCashFlow);
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

      <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700">{t("estimateAtCompletion")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("estimateAtCompletionHint")}</p>
      {!eac ? (
        <p className="text-gray-500">{tc("loading")}</p>
      ) : eac.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noProjects")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2">{t("project")}</th>
                <th className="text-right">{t("percentComplete")}</th>
                <th className="text-right">{t("costPerformanceIndex")}</th>
                <th className="text-right">{t("estimateAtCompletionShort")}</th>
                <th className="text-right">{t("varianceAtCompletion")}</th>
                <th className="text-right">{t("projectedMargin")}</th>
                <th className="text-right">{t("marginErosion")}</th>
              </tr>
            </thead>
            <tbody>
              {eac.map((row) => (
                <tr key={row.projectId} className="border-b border-gray-100">
                  <td className="py-2">
                    <a href={`/projects/${row.projectId}`} className="text-brand-700 hover:underline">
                      {row.projectName}
                    </a>
                  </td>
                  <td className="text-right tabular-nums">{row.percentComplete}%</td>
                  <td className="text-right tabular-nums">
                    {row.costPerformanceIndex === null ? "—" : row.costPerformanceIndex}
                  </td>
                  <td className="text-right tabular-nums">
                    {row.estimateAtCompletion} {currency}
                  </td>
                  <td className={`text-right tabular-nums ${row.varianceAtCompletion < 0 ? "text-error-700" : "text-success-700"}`}>
                    {row.varianceAtCompletion} {currency}
                  </td>
                  <td className={`text-right tabular-nums ${(row.projectedMarginPercent ?? 0) < 0 ? "text-error-700" : "text-success-700"}`}>
                    {row.projectedMarginPercent === null ? "—" : `${row.projectedMarginPercent}%`}
                  </td>
                  <td className={`text-right tabular-nums ${(row.marginErosionPercent ?? 0) > 0 ? "text-error-700" : "text-success-700"}`}>
                    {row.marginErosionPercent === null ? "—" : `${row.marginErosionPercent}%`}
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

      <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700">{t("cashFlowForecast")}</h2>
      {!cashFlow ? (
        <p className="text-gray-500">{tc("loading")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="card">
              <div className="text-xs text-gray-500">{t("projectedInflow")}</div>
              <div className="mt-1 text-lg font-semibold text-success-700">
                {cashFlow.totals.inflow} {currency}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500">{t("projectedOutflow")}</div>
              <div className="mt-1 text-lg font-semibold text-error-700">
                {cashFlow.totals.outflow} {currency}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500">{t("projectedNet")}</div>
              <div className={`mt-1 text-lg font-semibold ${cashFlow.totals.net < 0 ? "text-error-700" : "text-success-700"}`}>
                {cashFlow.totals.net} {currency}
              </div>
            </div>
          </div>

          {(cashFlow.unscheduledInflow > 0 || cashFlow.unscheduledOutflow > 0) && (
            <p className="mt-2 text-xs text-gray-500">
              {t("unscheduledNote", { inflow: cashFlow.unscheduledInflow, outflow: cashFlow.unscheduledOutflow, currency })}
            </p>
          )}

          <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-success-500" /> {t("inflow")}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-error-500" /> {t("outflow")}
              </span>
            </div>
            {(() => {
              const maxVal = Math.max(...cashFlow.weeks.flatMap((w) => [w.inflow, w.outflow]), 1);
              return (
                <div className="flex items-end gap-2" style={{ minWidth: cashFlow.weeks.length * 56 }}>
                  {cashFlow.weeks.map((w, i) => (
                    <div key={w.weekStart} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex h-24 items-end gap-0.5">
                        <div
                          className="w-3 rounded-t bg-success-500"
                          style={{ height: `${(w.inflow / maxVal) * 100}%` }}
                          title={`${t("inflow")}: ${w.inflow} ${currency}`}
                        />
                        <div
                          className="w-3 rounded-t bg-error-500"
                          style={{ height: `${(w.outflow / maxVal) * 100}%` }}
                          title={`${t("outflow")}: ${w.outflow} ${currency}`}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400">{t("weekLabel", { n: i + 1 })}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">{t("week")}</th>
                  <th className="text-right">{t("inflow")}</th>
                  <th className="text-right">{t("outflow")}</th>
                  <th className="text-right">{t("net")}</th>
                  <th className="text-right">{t("cumulativeNet")}</th>
                </tr>
              </thead>
              <tbody>
                {cashFlow.weeks.map((w) => (
                  <tr key={w.weekStart} className="border-b border-gray-100">
                    <td className="py-2">{new Date(w.weekStart).toLocaleDateString()}</td>
                    <td className="text-right text-success-700">
                      {w.inflow} {currency}
                    </td>
                    <td className="text-right text-error-700">
                      {w.outflow} {currency}
                    </td>
                    <td className={`text-right ${w.net < 0 ? "text-error-700" : "text-gray-700"}`}>
                      {w.net} {currency}
                    </td>
                    <td className={`text-right font-medium ${w.cumulativeNet < 0 ? "text-error-700" : "text-gray-900"}`}>
                      {w.cumulativeNet} {currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

      <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700">{t("scheduledReports")}</h2>
      <div className="card max-w-xl">
        <form onSubmit={createScheduledReport} className="flex flex-col gap-3">
          <input
            required
            placeholder={t("scheduleName")}
            className="input"
            value={scheduleForm.name}
            onChange={(e) => setScheduleForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("reportType")}</span>
              <select
                className="input"
                value={scheduleForm.reportType}
                onChange={(e) => setScheduleForm((f) => ({ ...f, reportType: e.target.value as ScheduledReportType }))}
              >
                {SCHEDULED_REPORT_TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {t(`reportType_${ty}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("frequency")}</span>
              <select
                className="input"
                value={scheduleForm.frequency}
                onChange={(e) => setScheduleForm((f) => ({ ...f, frequency: e.target.value as ScheduledReportFrequency }))}
              >
                {SCHEDULED_REPORT_FREQUENCIES.map((freq) => (
                  <option key={freq} value={freq}>
                    {t(`frequency_${freq}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("recipientEmails")}</span>
            <input
              required
              placeholder={t("recipientEmailsPlaceholder")}
              className="input"
              value={scheduleForm.recipientEmails}
              onChange={(e) => setScheduleForm((f) => ({ ...f, recipientEmails: e.target.value }))}
            />
          </label>
          <button type="submit" disabled={scheduleBusy} className="btn-primary self-start">
            {t("createSchedule")}
          </button>
        </form>
      </div>

      {!scheduledReports ? (
        <p className="mt-4 text-gray-500">{tc("loading")}</p>
      ) : scheduledReports.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">{t("noScheduledReports")}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {scheduledReports.map((report) => (
            <li key={report.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{report.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        report.active ? "bg-success-50 text-success-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {report.active ? t("active") : t("paused")}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {t(`reportType_${report.reportType}`)} · {t(`frequency_${report.frequency}`)} · {report.recipientEmails.join(", ")}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {t("nextRun", { date: new Date(report.nextRunAt).toLocaleDateString() })}
                    {report.lastSentAt && ` · ${t("lastSent", { date: new Date(report.lastSentAt).toLocaleDateString() })}`}
                  </div>
                  {sentNowId === report.id && <p className="mt-1 text-xs text-success-700">{t("sentNowConfirmation")}</p>}
                </div>
                <div className="flex flex-none flex-col gap-1.5">
                  <button onClick={() => sendScheduledReportNow(report.id)} className="btn-secondary px-2.5 py-1 text-xs">
                    {t("sendNow")}
                  </button>
                  <button onClick={() => toggleScheduledReportActive(report)} className="btn-secondary px-2.5 py-1 text-xs">
                    {report.active ? t("pause") : t("resume")}
                  </button>
                  <button onClick={() => deleteScheduledReport(report.id)} className="text-xs text-gray-400 hover:text-error-600">
                    {tc("delete")}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CustomReportsPanel />
    </AuthenticatedShell>
  );
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
