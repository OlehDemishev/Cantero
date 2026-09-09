"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface CalibrationRecord {
  id: string;
  calibratedAt: string;
  nextDueAt: string;
  certificateNumber: string | null;
  performedBy: string | null;
}

type Props = { toolCribItemId: string; equipmentId?: undefined } | { equipmentId: string; toolCribItemId?: undefined };

export function CalibrationPanel(props: Props) {
  const t = useTranslations("calibration");
  const tc = useTranslations("common");

  const [records, setRecords] = useState<CalibrationRecord[] | null>(null);
  const [form, setForm] = useState({ calibratedAt: "", nextDueAt: "", certificateNumber: "", performedBy: "" });
  const [busy, setBusy] = useState(false);

  const query = props.toolCribItemId ? `toolCribItemId=${props.toolCribItemId}` : `equipmentId=${props.equipmentId}`;

  function load() {
    apiFetch<CalibrationRecord[]>(`/calibration-records?${query}`).then(setRecords);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [props.toolCribItemId, props.equipmentId]);

  async function log(e: React.FormEvent) {
    e.preventDefault();
    if (!form.calibratedAt || !form.nextDueAt) return;
    setBusy(true);
    try {
      await apiFetch("/calibration-records", {
        method: "POST",
        body: JSON.stringify({
          toolCribItemId: props.toolCribItemId,
          equipmentId: props.equipmentId,
          calibratedAt: new Date(form.calibratedAt).toISOString(),
          nextDueAt: new Date(form.nextDueAt).toISOString(),
          certificateNumber: form.certificateNumber || undefined,
          performedBy: form.performedBy || undefined,
        }),
      });
      setForm({ calibratedAt: "", nextDueAt: "", certificateNumber: "", performedBy: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  const latest = records?.[0] ?? null;
  const overdue = latest && new Date(latest.nextDueAt) < new Date();

  return (
    <section className="card">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      {!records ? (
        <p className="mb-3 text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : records.length === 0 ? (
        <p className="mb-3 text-sm text-gray-400 dark:text-gray-500">{t("noRecords")}</p>
      ) : (
        <>
          <p className={`mb-2 text-xs font-medium ${overdue ? "text-error-700 dark:text-error-500" : "text-success-700 dark:text-success-500"}`}>
            {t("nextDue")}: {formatDate(new Date(latest!.nextDueAt))}
            {overdue && ` — ${t("overdue")}`}
          </p>
          <ul className="mb-3 flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
            {records.map((r) => (
              <li key={r.id}>
                {formatDate(new Date(r.calibratedAt))} → {t("dueOn")} {formatDate(new Date(r.nextDueAt))}
                {r.certificateNumber && ` · ${r.certificateNumber}`}
                {r.performedBy && ` · ${r.performedBy}`}
              </li>
            ))}
          </ul>
        </>
      )}

      <form onSubmit={log} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("calibratedAt")}
          <input required type="date" className="input" value={form.calibratedAt} onChange={(e) => setForm((f) => ({ ...f, calibratedAt: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("nextDueAt")}
          <input required type="date" className="input" value={form.nextDueAt} onChange={(e) => setForm((f) => ({ ...f, nextDueAt: e.target.value }))} />
        </label>
        <input
          placeholder={t("certificateNumberPlaceholder")}
          className="input w-32"
          value={form.certificateNumber}
          onChange={(e) => setForm((f) => ({ ...f, certificateNumber: e.target.value }))}
        />
        <input
          placeholder={t("performedByPlaceholder")}
          className="input w-32"
          value={form.performedBy}
          onChange={(e) => setForm((f) => ({ ...f, performedBy: e.target.value }))}
        />
        <button type="submit" disabled={busy} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
          {t("logCalibration")}
        </button>
      </form>
    </section>
  );
}
