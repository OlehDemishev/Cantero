"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/format-date";
import { formatNumber } from "@/lib/format-currency";

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

  const { data: logs = null, reload: reloadLogs } = useApi<ProductivityLog[]>(`/projects/${projectId}/productivity-logs`);
  const { data: costCodes = [] } = useApi<CostCode[]>("/cost-codes");
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
    void reloadLogs();
  }

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
        <h2 className="text-sm font-semibold text-fg-muted">{t("title")}</h2>
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
              <span className="font-medium text-fg-muted">{t("costCode")}</span>
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
              <span className="font-medium text-fg-muted">{t("workDate")}</span>
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
              <span className="font-medium text-fg-muted">{t("quantityCompleted")}</span>
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
              <span className="font-medium text-fg-muted">{t("unit")}</span>
              <input required className="input" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
            </label>
            <label className="flex w-32 flex-col gap-1.5 text-sm">
              <span className="font-medium text-fg-muted">{t("laborHours")}</span>
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
            <span className="font-medium text-fg-muted">{t("crewName")}</span>
            <input className="input" value={form.crewName} onChange={(e) => setForm((f) => ({ ...f, crewName: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-fg-muted">{t("notes")}</span>
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
        <p className="text-sm text-fg-subtle">{tc("loading")}</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noLogs")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {logs.map((log) => {
            const hoursPerUnit = log.quantityCompleted > 0 ? log.laborHours / log.quantityCompleted : null;
            return (
              <li key={log.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-fg">
                        {log.quantityCompleted} {log.unit}
                      </span>
                      {log.costCode && <span className="text-xs text-fg-subtle">{log.costCode.code}</span>}
                    </div>
                    <p className="mt-1 text-xs text-fg-subtle">
                      {t("logSummary", { hours: log.laborHours, date: formatDate(new Date(log.workDate)) })}
                      {log.crewName ? ` — ${log.crewName}` : ""}
                    </p>
                    {log.notes && <p className="mt-1 text-xs text-fg-subtle">{log.notes}</p>}
                  </div>
                  {hoursPerUnit !== null && (
                    <span className="shrink-0 text-xs font-medium tabular-nums text-fg-subtle">
                      {t("hoursPerUnit", { rate: formatNumber(hoursPerUnit, { fractionDigits: 3 }), unit: log.unit })}
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
