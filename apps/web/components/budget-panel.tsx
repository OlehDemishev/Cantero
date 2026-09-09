"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatCurrency } from "@/lib/format-currency";
import { formatDate } from "@/lib/format-date";

interface BudgetRevision {
  id: string;
  amount: number;
  reason: string;
  createdByName: string;
  createdAt: string;
}
interface ContingencyDraw {
  id: string;
  amount: number;
  reason: string;
  createdByName: string;
  createdAt: string;
}
interface BudgetVsActual {
  estimatesCount: number;
  materialsCostBudget: number;
  materialsCostActual: number;
  materialsCostVariance: number;
  laborCostBudget: number;
  laborCostActual: number;
  laborCostVariance: number;
  laborHoursLogged: number;
  laborHoursUncosted: number;
  subcontractorCostActual: number;
  subcontractorCostUnpaid: number;
  grandTotalBudget: number;
  budgetRevisionsTotal: number;
  revisedBudgetTotal: number;
  revisions: BudgetRevision[];
  invoicedTotal: number;
  paidTotal: number;
  outstandingTotal: number;
  contingencyAmount: number | null;
  contingencyDrawnTotal: number;
  contingencyRemaining: number | null;
  contingencyDraws: ContingencyDraw[];
}

export function BudgetPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("budget");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const [budget, setBudget] = useState<BudgetVsActual | null>(null);
  const [addingRevision, setAddingRevision] = useState(false);
  const [revisionForm, setRevisionForm] = useState({ amount: "", reason: "" });
  const [addingDraw, setAddingDraw] = useState(false);
  const [drawForm, setDrawForm] = useState({ amount: "", reason: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<BudgetVsActual>(`/finance/budget-vs-actual?projectId=${projectId}`).then(setBudget);
  }

  useEffect(load, [projectId]);

  async function submitRevision(e: React.FormEvent) {
    e.preventDefault();
    if (!revisionForm.amount || !revisionForm.reason.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/finance/budget-vs-actual/revisions", {
        method: "POST",
        body: JSON.stringify({ projectId, amount: Number(revisionForm.amount), reason: revisionForm.reason.trim() }),
      });
      setRevisionForm({ amount: "", reason: "" });
      setAddingRevision(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function submitDraw(e: React.FormEvent) {
    e.preventDefault();
    if (!drawForm.amount || !drawForm.reason.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/finance/budget-vs-actual/contingency-draws", {
        method: "POST",
        body: JSON.stringify({ projectId, amount: Number(drawForm.amount), reason: drawForm.reason.trim() }),
      });
      setDrawForm({ amount: "", reason: "" });
      setAddingDraw(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!budget) return null;
  const currency = me?.company.currency ?? "";
  const money = (amount: number | string | null | undefined) => formatCurrency(amount, currency, me?.company.locale);

  if (budget.estimatesCount === 0) {
    return (
      <div className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noApprovedEstimates")}</p>
      </div>
    );
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <BudgetCard
          title={t("materialsCost")}
          rows={[
            [t("budget"), money(budget.materialsCostBudget)],
            [t("actual"), money(budget.materialsCostActual)],
            [
              t("variance"),
              `${budget.materialsCostVariance >= 0 ? "+" : ""}${money(budget.materialsCostVariance)}`,
              budget.materialsCostVariance < 0 ? "text-red-600" : "text-green-700",
            ],
          ]}
        />
        <BudgetCard
          title={t("laborCost")}
          rows={[
            [t("budget"), money(budget.laborCostBudget)],
            [t("actual"), money(budget.laborCostActual)],
            [
              t("variance"),
              `${budget.laborCostVariance >= 0 ? "+" : ""}${money(budget.laborCostVariance)}`,
              budget.laborCostVariance < 0 ? "text-red-600" : "text-green-700",
            ],
            [t("hoursLogged"), `${budget.laborHoursLogged}h`],
            ...(budget.laborHoursUncosted > 0
              ? ([[t("hoursUncosted"), `${budget.laborHoursUncosted}h`]] as [string, string][])
              : []),
          ]}
        />
        {budget.subcontractorCostActual > 0 && (
          <BudgetCard
            title={t("subcontractorCost")}
            rows={[
              [t("actual"), money(budget.subcontractorCostActual)],
              ...(budget.subcontractorCostUnpaid > 0
                ? ([[t("unpaid"), money(budget.subcontractorCostUnpaid), "text-warning-700 dark:text-warning-500"]] as [
                    string,
                    string,
                    string,
                  ][])
                : []),
            ]}
          />
        )}
        <BudgetCard
          title={t("grandTotalBudget")}
          rows={[
            [t("grandTotalBudget"), money(budget.grandTotalBudget)],
            ...(budget.budgetRevisionsTotal !== 0
              ? ([
                  [t("budgetRevisionsTotal"), `${budget.budgetRevisionsTotal >= 0 ? "+" : ""}${money(budget.budgetRevisionsTotal)}`],
                  [t("revisedBudgetTotal"), money(budget.revisedBudgetTotal), "font-medium text-gray-900 dark:text-gray-50"],
                ] as [string, string, string?][])
              : []),
            [t("invoicedTotal"), money(budget.invoicedTotal)],
            [t("paidTotal"), money(budget.paidTotal)],
            [t("outstandingTotal"), money(budget.outstandingTotal)],
          ]}
        />
        {budget.contingencyAmount !== null && (
          <BudgetCard
            title={t("contingency")}
            rows={[
              [t("contingencyAmount"), money(budget.contingencyAmount)],
              [t("contingencyDrawnTotal"), money(budget.contingencyDrawnTotal)],
              [
                t("contingencyRemaining"),
                money(budget.contingencyRemaining),
                (budget.contingencyRemaining ?? 0) < 0 ? "text-red-600 font-medium" : "font-medium text-gray-900 dark:text-gray-50",
              ],
            ]}
          />
        )}
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("revisionLog")}</h3>
          {!addingRevision && (
            <button onClick={() => setAddingRevision(true)} className="btn-secondary px-2.5 py-1 text-xs">
              {t("addRevision")}
            </button>
          )}
        </div>

        {addingRevision && (
          <form onSubmit={submitRevision} className="card mb-3 flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                required
                type="number"
                step="0.01"
                placeholder={t("revisionAmountPlaceholder")}
                className="input w-40"
                value={revisionForm.amount}
                onChange={(e) => setRevisionForm((f) => ({ ...f, amount: e.target.value }))}
              />
              <input
                required
                placeholder={t("revisionReasonPlaceholder")}
                className="input flex-1"
                value={revisionForm.reason}
                onChange={(e) => setRevisionForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="btn-primary px-3 py-1 text-xs">
                {tc("save")}
              </button>
              <button type="button" onClick={() => setAddingRevision(false)} className="btn-secondary px-3 py-1 text-xs">
                {tc("cancel")}
              </button>
            </div>
          </form>
        )}

        {budget.revisions.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">{t("noRevisions")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {budget.revisions.map((r) => (
              <li key={r.id} className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className={`font-medium ${Number(r.amount) >= 0 ? "text-success-700 dark:text-success-500" : "text-error-700 dark:text-error-500"}`}>
                    {Number(r.amount) >= 0 ? "+" : ""}
                    {money(r.amount)}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(new Date(r.createdAt))}</span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{r.reason}</p>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{r.createdByName}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {budget.contingencyAmount !== null && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("contingencyDrawLog")}</h3>
            {!addingDraw && (
              <button onClick={() => setAddingDraw(true)} className="btn-secondary px-2.5 py-1 text-xs">
                {t("addDraw")}
              </button>
            )}
          </div>

          {addingDraw && (
            <form onSubmit={submitDraw} className="card mb-3 flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder={t("drawAmountPlaceholder")}
                  className="input w-40"
                  value={drawForm.amount}
                  onChange={(e) => setDrawForm((f) => ({ ...f, amount: e.target.value }))}
                />
                <input
                  required
                  placeholder={t("drawReasonPlaceholder")}
                  className="input flex-1"
                  value={drawForm.reason}
                  onChange={(e) => setDrawForm((f) => ({ ...f, reason: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="btn-primary px-3 py-1 text-xs">
                  {tc("save")}
                </button>
                <button type="button" onClick={() => setAddingDraw(false)} className="btn-secondary px-3 py-1 text-xs">
                  {tc("cancel")}
                </button>
              </div>
            </form>
          )}

          {budget.contingencyDraws.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("noDraws")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {budget.contingencyDraws.map((d) => (
                <li key={d.id} className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-error-700 dark:text-error-500">-{money(d.amount)}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(new Date(d.createdAt))}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{d.reason}</p>
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{d.createdByName}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function BudgetCard({ title, rows }: { title: string; rows: [string, string, string?][] }) {
  return (
    <div className="card">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</div>
      <dl className="flex flex-col gap-1 text-sm">
        {rows.map(([label, value, colorClass]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
            <dd className={colorClass}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
