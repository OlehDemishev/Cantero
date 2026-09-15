"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { TimeOffPanel } from "@/components/time-off-panel";
import { CertificationsDashboardPanel } from "@/components/certifications-dashboard-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { CloseIcon, TeamIcon } from "@/components/nav-icons";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface Worker {
  id: string;
  name: string;
  role: string | null;
  hourlyCost: string | null;
  active: boolean;
}
interface LaborCostRow {
  workerId: string;
  workerName: string;
  role: string | null;
  hours: number;
  cost: number;
}
interface LaborCostReport {
  totalHours: number;
  totalCost: number;
  byWorker: LaborCostRow[];
}

export default function TeamPage() {
  const t = useTranslations("team");
  const tc = useTranslations("common");
  const { data: me } = useMe();

  const [workers, setWorkers] = useState<Worker[] | null>(null);
  const burdenPercent =
    Number(me?.company.payrollTaxBurdenPercent ?? 0) +
    Number(me?.company.workersCompBurdenPercent ?? 0) +
    Number(me?.company.benefitsBurdenPercent ?? 0) +
    Number(me?.company.otherBurdenPercent ?? 0);
  const [report, setReport] = useState<LaborCostReport | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState({ name: "", role: "", hourlyCost: "" });
  const [submitting, setSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  function load() {
    apiFetch<Worker[]>("/workers").then(setWorkers);
    apiFetch<LaborCostReport>("/team/labor-cost-report").then(setReport);
  }

  useEffect(load, []);

  const visibleWorkers = workers?.filter((w) => showInactive || w.active) ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/workers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          role: form.role || undefined,
          hourlyCost: form.hourlyCost ? Number(form.hourlyCost) : undefined,
        }),
      });
      setForm({ name: "", role: "", hourlyCost: "" });
      setShowCreateForm(false);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthenticatedShell>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {!showCreateForm && (
          <button type="button" onClick={() => setShowCreateForm(true)} className="btn-primary">
            {t("newWorker")}
          </button>
        )}
      </div>

      {showCreateForm && (
        <div className="mt-6 card max-w-md">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("newWorker")}</h2>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              aria-label={tc("cancel")}
              className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              required
              autoFocus
              placeholder={tc("name")}
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              placeholder={t("role")}
              className="input"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            />
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("hourlyCost")} ({me?.company.currency})
              <input
                type="number"
                step="0.01"
                className="input mt-1"
                value={form.hourlyCost}
                onChange={(e) => setForm((f) => ({ ...f, hourlyCost: e.target.value }))}
              />
            </label>
            <button type="submit" disabled={submitting} className="btn-primary">
              {tc("create")}
            </button>
          </form>
        </div>
      )}

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("workers")}</h2>
          <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            {t("showInactive")}
          </label>
        </div>
        {!visibleWorkers ? (
          <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
        ) : visibleWorkers.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={TeamIcon}
              title={t("emptyTitle")}
              message={t("empty")}
              cta={{ label: t("newWorker"), onClick: () => setShowCreateForm(true) }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="py-2">{tc("name")}</th>
                  <th>{t("role")}</th>
                  <th>{t("hourlyCost")}</th>
                  {burdenPercent > 0 && <th>{t("loadedRate")}</th>}
                  <th>{tc("status")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleWorkers.map((w) => (
                  <tr key={w.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2">
                      <a href={`/team/${w.id}`} className="font-medium text-brand-700 dark:text-brand-400 hover:underline">
                        {w.name}
                      </a>
                    </td>
                    <td>{w.role ?? "—"}</td>
                    <td>{w.hourlyCost ? `${w.hourlyCost} ${me?.company.currency}` : "—"}</td>
                    {burdenPercent > 0 && (
                      <td>
                        {w.hourlyCost ? `${(Number(w.hourlyCost) * (1 + burdenPercent / 100)).toFixed(2)} ${me?.company.currency}` : "—"}
                      </td>
                    )}
                    <td>
                      {w.active ? (
                        <span className="text-xs text-success-700 dark:text-success-500">{t("active")}</span>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">{t("inactive")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("laborCostReport")}</h2>
          {!report ? (
            <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
          ) : report.byWorker.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("noLaborCost")}</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="py-2">{tc("name")}</th>
                  <th>{t("role")}</th>
                  <th className="text-right">{t("hours")}</th>
                  <th className="text-right">{t("cost")}</th>
                </tr>
              </thead>
              <tbody>
                {report.byWorker.map((r) => (
                  <tr key={r.workerId} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2">
                      <a href={`/team/${r.workerId}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                        {r.workerName}
                      </a>
                    </td>
                    <td>{r.role ?? "—"}</td>
                    <td className="text-right">{r.hours}h</td>
                    <td className="text-right">
                      {r.cost} {me?.company.currency}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 dark:border-gray-700 font-medium">
                  <td className="py-2" colSpan={2}>
                    {t("total")}
                  </td>
                  <td className="text-right">{report.totalHours}h</td>
                  <td className="text-right">
                    {report.totalCost} {me?.company.currency}
                  </td>
                </tr>
              </tfoot>
            </table>
            </div>
          )}
      </div>

      <CertificationsDashboardPanel />
      <TimeOffPanel />
    </AuthenticatedShell>
  );
}
