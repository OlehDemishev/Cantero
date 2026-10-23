"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format-date";
import { Field } from "@/components/ui/field";

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

  const [form, setForm] = useState({ calibratedAt: "", nextDueAt: "", certificateNumber: "", performedBy: "" });
  const [busy, setBusy] = useState(false);

  const query = props.toolCribItemId ? `toolCribItemId=${props.toolCribItemId}` : `equipmentId=${props.equipmentId}`;
  const { data: records = null, reload: reloadRecords, error: recordsError } = useApi<CalibrationRecord[]>(`/calibration-records?${query}`);

  function load() {
    void reloadRecords();
  }

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
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("hint")}</p>

      {!records ? (
        recordsError ? <ErrorState error={recordsError} onRetry={reloadRecords} compact className="mb-3" /> : <Skeleton className="mb-3" lines={3} />
      ) : records.length === 0 ? (
        <p className="mb-3 text-sm text-fg-subtle">{t("noRecords")}</p>
      ) : (
        <>
          <p className={`mb-2 text-xs font-medium ${overdue ? "text-danger-fg" : "text-success-fg"}`}>
            {t("nextDue")}: {formatDate(new Date(latest!.nextDueAt))}
            {overdue && ` — ${t("overdue")}`}
          </p>
          <ul className="mb-3 flex flex-col gap-1 text-xs text-fg-subtle">
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
        <Field label={t("calibratedAt")} size="sm">
          <input required type="date" className="input" value={form.calibratedAt} onChange={(e) => setForm((f) => ({ ...f, calibratedAt: e.target.value }))} />
        </Field>
        <Field label={t("nextDueAt")} size="sm">
          <input required type="date" className="input" value={form.nextDueAt} onChange={(e) => setForm((f) => ({ ...f, nextDueAt: e.target.value }))} />
        </Field>
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
