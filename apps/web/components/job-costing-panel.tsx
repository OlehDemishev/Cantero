"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import type { CostCode } from "@/components/cost-codes-panel";
import { formatDate } from "@/lib/format-date";

interface CostHistoryMonth {
  month: string;
  committed: number;
  actual: number;
  cumulativeActual: number;
}

interface JobCostRow {
  costCodeId: string | null;
  code: string;
  name: string;
  estimated: number;
  committed: number;
  actual: number;
  variance: number;
  estimateAtCompletion: number;
  varianceAtCompletion: number;
}
interface JobCostTotals {
  estimated: number;
  committed: number;
  actual: number;
  variance: number;
  estimateAtCompletion: number;
  varianceAtCompletion: number;
}
interface BudgetTransfer {
  id: string;
  fromCode: string;
  toCode: string;
  amount: number;
  reason: string;
  createdByName: string;
  createdAt: string;
}
interface JobCostForecast {
  percentComplete: number;
  rows: JobCostRow[];
  totals: JobCostTotals;
  transfers: BudgetTransfer[];
}

export function JobCostingPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("jobCosting");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [report, setReport] = useState<JobCostForecast | null>(null);
  const [history, setHistory] = useState<CostHistoryMonth[] | null>(null);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [transferring, setTransferring] = useState(false);
  const [transferForm, setTransferForm] = useState({ fromCostCodeId: "", toCostCodeId: "", amount: "", reason: "" });
  const [transferError, setTransferError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<JobCostForecast>(`/job-costing/forecast?projectId=${projectId}`).then(setReport);
    apiFetch<CostHistoryMonth[]>(`/job-costing/history?projectId=${projectId}`).then(setHistory);
  }

  useEffect(load, [projectId]);
  useEffect(() => {
    apiFetch<CostCode[]>("/cost-codes").then((codes) => {
      setCostCodes(codes);
      if (codes.length >= 2) setTransferForm((f) => ({ ...f, fromCostCodeId: f.fromCostCodeId || codes[0].id, toCostCodeId: f.toCostCodeId || codes[1].id }));
    });
  }, []);

  async function submitTransfer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setTransferError(null);
    try {
      await apiFetch("/job-costing/budget-transfers", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          fromCostCodeId: transferForm.fromCostCodeId,
          toCostCodeId: transferForm.toCostCodeId,
          amount: Number(transferForm.amount),
          reason: transferForm.reason,
        }),
      });
      setTransferForm((f) => ({ ...f, amount: "", reason: "" }));
      setTransferring(false);
      load();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!report || report.rows.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("hint", { percent: report.percentComplete })}</p>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-800">
              <th className="py-2">{t("costCode")}</th>
              <th className="text-right">{t("estimated")}</th>
              <th className="text-right">{t("committed")}</th>
              <th className="text-right">{t("actual")}</th>
              <th className="text-right">{t("variance")}</th>
              <th className="text-right">{t("eac")}</th>
              <th className="text-right">{t("vac")}</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.code} className="border-b border-gray-100 dark:border-gray-800/60">
                <td className="py-1.5">
                  <span className="font-mono text-xs text-gray-400">{row.code}</span> {row.name}
                </td>
                <td className="text-right">
                  {row.estimated.toFixed(2)} {currency}
                </td>
                <td className="text-right">
                  {row.committed.toFixed(2)} {currency}
                </td>
                <td className="text-right">
                  {row.actual.toFixed(2)} {currency}
                </td>
                <td className={`text-right font-medium ${row.variance < 0 ? "text-error-600" : "text-success-700"}`}>
                  {row.variance.toFixed(2)} {currency}
                </td>
                <td className="text-right">
                  {row.estimateAtCompletion.toFixed(2)} {currency}
                </td>
                <td className={`text-right font-medium ${row.varianceAtCompletion < 0 ? "text-error-600" : "text-success-700"}`}>
                  {row.varianceAtCompletion.toFixed(2)} {currency}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="pt-2">{t("total")}</td>
              <td className="pt-2 text-right">
                {report.totals.estimated.toFixed(2)} {currency}
              </td>
              <td className="pt-2 text-right">
                {report.totals.committed.toFixed(2)} {currency}
              </td>
              <td className="pt-2 text-right">
                {report.totals.actual.toFixed(2)} {currency}
              </td>
              <td className={`pt-2 text-right ${report.totals.variance < 0 ? "text-error-600" : "text-success-700"}`}>
                {report.totals.variance.toFixed(2)} {currency}
              </td>
              <td className="pt-2 text-right">
                {report.totals.estimateAtCompletion.toFixed(2)} {currency}
              </td>
              <td className={`pt-2 text-right ${report.totals.varianceAtCompletion < 0 ? "text-error-600" : "text-success-700"}`}>
                {report.totals.varianceAtCompletion.toFixed(2)} {currency}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {history && history.some((m) => m.actual > 0 || m.committed > 0) && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("burnDown")}</h3>
          <div className="card h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200, #e5e7eb)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => `${Number(value).toFixed(2)} ${currency}`} />
                <Line type="monotone" dataKey="cumulativeActual" name={t("actual")} stroke="#465fff" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {costCodes.length >= 2 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("budgetTransfers")}</h3>
            {!transferring && (
              <button onClick={() => setTransferring(true)} className="btn-secondary px-2.5 py-1 text-xs">
                {t("transferBudget")}
              </button>
            )}
          </div>

          {transferring && (
            <form onSubmit={submitTransfer} className="card mb-3 flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <select
                  className="input"
                  value={transferForm.fromCostCodeId}
                  onChange={(e) => setTransferForm((f) => ({ ...f, fromCostCodeId: e.target.value }))}
                >
                  <option value="" disabled>
                    {t("transferFrom")}
                  </option>
                  {costCodes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
                <select
                  className="input"
                  value={transferForm.toCostCodeId}
                  onChange={(e) => setTransferForm((f) => ({ ...f, toCostCodeId: e.target.value }))}
                >
                  <option value="" disabled>
                    {t("transferTo")}
                  </option>
                  {costCodes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder={t("transferAmountPlaceholder")}
                  className="input w-40"
                  value={transferForm.amount}
                  onChange={(e) => setTransferForm((f) => ({ ...f, amount: e.target.value }))}
                />
                <input
                  required
                  placeholder={t("transferReasonPlaceholder")}
                  className="input flex-1"
                  value={transferForm.reason}
                  onChange={(e) => setTransferForm((f) => ({ ...f, reason: e.target.value }))}
                />
              </div>
              {transferError && <p className="text-xs text-error-600">{transferError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="btn-primary px-3 py-1 text-xs">
                  {tc("save")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTransferring(false);
                    setTransferError(null);
                  }}
                  className="btn-secondary px-3 py-1 text-xs"
                >
                  {tc("cancel")}
                </button>
              </div>
            </form>
          )}

          {report.transfers.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noTransfers")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {report.transfers.map((tr) => (
                <li key={tr.id} className="rounded-md border border-gray-200 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">
                      {t("transferLogEntry", { amount: `${tr.amount.toFixed(2)} ${currency}`, from: tr.fromCode, to: tr.toCode })}
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(new Date(tr.createdAt))}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{tr.reason}</p>
                  <p className="mt-0.5 text-xs text-gray-400">{tr.createdByName}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
