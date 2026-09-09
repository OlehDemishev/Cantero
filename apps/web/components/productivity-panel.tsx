"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface CostCode {
  id: string;
  code: string;
  name: string;
}
interface ProductivityLog {
  id: string;
  workDate: string;
  quantityCompleted: number;
  unit: string;
  laborHours: number;
  crewName: string | null;
  notes: string | null;
  costCode: CostCode | null;
}

export function ProductivityPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("productivity");
  const tc = useTranslations("common");

  const [logs, setLogs] = useState<ProductivityLog[] | null>(null);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    costCodeId: "",
    workDate: "",
    quantityCompleted: "",
    unit: "",
    laborHours: "",
    crewName: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<ProductivityLog[]>(`/projects/${projectId}/productivity-logs`).then(setLogs);
  }

  useEffect(() => {
    load();
    apiFetch<CostCode[]>("/cost-codes").then(setCostCodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/productivity-logs`, {
        method: "POST",
        body: JSON.stringify({
          costCodeId: form.costCodeId || undefined,
          workDate: new Date(form.workDate).toISOString(),
          quantityCompleted: Number(form.quantityCompleted),
          unit: form.unit,
          laborHours: Number(form.laborHours),
          crewName: form.crewName || undefined,
          notes: form.notes || undefined,
        }),
      });
      setForm({ costCodeId: "", workDate: "", quantityCompleted: "", unit: "", laborHours: "", crewName: "", notes: "" });
      setCreating(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newLog")}
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={submit} className="card mb-4 flex flex-col gap-3">
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("costCode")}</span>
              <select
                className="input"
                value={form.costCodeId}
                onChange={(e) => setForm((f) => ({ ...f, costCodeId: e.target.value }))}
              >
                <option value="">{tc("none")}</option>
                {costCodes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-40 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("workDate")}</span>
              <input
                required
                type="date"
                className="input"
                value={form.workDate}
                onChange={(e) => setForm((f) => ({ ...f, workDate: e.target.value }))}
              />
            </label>
          </div>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("quantityCompleted")}</span>
              <input
                required
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={form.quantityCompleted}
                onChange={(e) => setForm((f) => ({ ...f, quantityCompleted: e.target.value }))}
              />
            </label>
            <label className="flex w-28 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("unit")}</span>
              <input required className="input" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
            </label>
            <label className="flex w-32 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("laborHours")}</span>
              <input
                required
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={form.laborHours}
                onChange={(e) => setForm((f) => ({ ...f, laborHours: e.target.value }))}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("crewName")}</span>
            <input className="input" value={form.crewName} onChange={(e) => setForm((f) => ({ ...f, crewName: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("notes")}</span>
            <textarea rows={2} className="input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {logs === null ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noLogs")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {logs.map((log) => {
            const hoursPerUnit = log.quantityCompleted > 0 ? log.laborHours / log.quantityCompleted : null;
            return (
              <li key={log.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                        {log.quantityCompleted} {log.unit}
                      </span>
                      {log.costCode && <span className="text-xs text-gray-500 dark:text-gray-400">{log.costCode.code}</span>}
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {t("logSummary", { hours: log.laborHours, date: formatDate(new Date(log.workDate)) })}
                      {log.crewName ? ` — ${log.crewName}` : ""}
                    </p>
                    {log.notes && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{log.notes}</p>}
                  </div>
                  {hoursPerUnit !== null && (
                    <span className="shrink-0 text-xs font-medium tabular-nums text-gray-500 dark:text-gray-400">
                      {t("hoursPerUnit", { rate: hoursPerUnit.toFixed(3), unit: log.unit })}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
