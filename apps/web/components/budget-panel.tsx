"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface BudgetRevision {
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
}

export function BudgetPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("budget");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const [budget, setBudget] = useState<BudgetVsActual | null>(null);
  const [addingRevision, setAddingRevision] = useState(false);
  const [revisionForm, setRevisionForm] = useState({ amount: "", reason: "" });
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

  if (!budget) return null;
  const currency = me?.company.currency ?? "";

  if (budget.estimatesCount === 0) {
    return (
      <div className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("title")}</h2>
        <p className="text-sm text-gray-400">{t("noApprovedEstimates")}</p>
      </div>
    );
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <BudgetCard
          title={t("materialsCost")}
          rows={[
            [t("budget"), `${budget.materialsCostBudget} ${currency}`],
            [t("actual"), `${budget.materialsCostActual} ${currency}`],
            [
              t("variance"),
              `${budget.materialsCostVariance >= 0 ? "+" : ""}${budget.materialsCostVariance} ${currency}`,
              budget.materialsCostVariance < 0 ? "text-red-600" : "text-green-700",
            ],
          ]}
        />
        <BudgetCard
          title={t("laborCost")}
          rows={[
            [t("budget"), `${budget.laborCostBudget} ${currency}`],
            [t("actual"), `${budget.laborCostActual} ${currency}`],
            [
              t("variance"),
              `${budget.laborCostVariance >= 0 ? "+" : ""}${budget.laborCostVariance} ${currency}`,
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
              [t("actual"), `${budget.subcontractorCostActual} ${currency}`],
              ...(budget.subcontractorCostUnpaid > 0
                ? ([[t("unpaid"), `${budget.subcontractorCostUnpaid} ${currency}`, "text-warning-700"]] as [
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
            [t("grandTotalBudget"), `${budget.grandTotalBudget} ${currency}`],
            ...(budget.budgetRevisionsTotal !== 0
              ? ([
                  [t("budgetRevisionsTotal"), `${budget.budgetRevisionsTotal >= 0 ? "+" : ""}${budget.budgetRevisionsTotal} ${currency}`],
                  [t("revisedBudgetTotal"), `${budget.revisedBudgetTotal} ${currency}`, "font-medium text-gray-900"],
                ] as [string, string, string?][])
              : []),
            [t("invoicedTotal"), `${budget.invoicedTotal} ${currency}`],
            [t("paidTotal"), `${budget.paidTotal} ${currency}`],
            [t("outstandingTotal"), `${budget.outstandingTotal} ${currency}`],
          ]}
        />
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("revisionLog")}</h3>
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
          <p className="text-sm text-gray-400">{t("noRevisions")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {budget.revisions.map((r) => (
              <li key={r.id} className="rounded-md border border-gray-200 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className={`font-medium ${Number(r.amount) >= 0 ? "text-success-700" : "text-error-700"}`}>
                    {Number(r.amount) >= 0 ? "+" : ""}
                    {r.amount} {currency}
                  </span>
                  <span className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">{r.reason}</p>
                <p className="mt-0.5 text-xs text-gray-400">{r.createdByName}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function BudgetCard({ title, rows }: { title: string; rows: [string, string, string?][] }) {
  return (
    <div className="card">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      <dl className="flex flex-col gap-1 text-sm">
        {rows.map(([label, value, colorClass]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-gray-500">{label}</dt>
            <dd className={colorClass}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
