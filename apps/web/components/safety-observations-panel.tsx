"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ObservationCategory } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PrintButton } from "@/components/ui/print-button";
import { formatDate } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";

interface Observation {
  id: string;
  observedAt: string;
  category: ObservationCategory;
  behaviorObserved: string;
  correctiveAction: string | null;
  observerName: string;
}

export function SafetyObservationsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("safetyObservations");
  const tc = useTranslations("common");

  const { data: observations = null, reload: reloadObservations, error: observationsError } = useApi<Observation[]>(`/safety/observations?projectId=${projectId}`);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ category: "safe" as ObservationCategory, behaviorObserved: "", correctiveAction: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadObservations();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/safety/observations", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          category: form.category,
          behaviorObserved: form.behaviorObserved,
          correctiveAction: form.category === "at_risk" ? form.correctiveAction : undefined,
        }),
      });
      setForm({ category: "safe", behaviorObserved: "", correctiveAction: "" });
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
        <div className="flex items-center gap-1.5">
          {!creating && (
            <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
              {t("newObservation")}
            </button>
          )}
          <PrintButton />
        </div>
      </div>

      {creating && (
        <form onSubmit={submit} className="card mb-4 flex flex-col gap-3">
          <Field label={t("category")}>
            <select
              className="input"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ObservationCategory }))}
            >
              <option value="safe">{t("safe")}</option>
              <option value="at_risk">{t("at_risk")}</option>
            </select>
          </Field>
          <Field label={t("behaviorObserved")}>
            <textarea
              required
              rows={2}
              className="input"
              value={form.behaviorObserved}
              onChange={(e) => setForm((f) => ({ ...f, behaviorObserved: e.target.value }))}
            />
          </Field>
          {form.category === "at_risk" && (
            <Field label={t("correctiveAction")}>
              <textarea
                required
                rows={2}
                className="input"
                value={form.correctiveAction}
                onChange={(e) => setForm((f) => ({ ...f, correctiveAction: e.target.value }))}
              />
            </Field>
          )}
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

      {observations === null ? (
        observationsError ? <ErrorState error={observationsError} onRetry={reloadObservations} compact /> : <Skeleton lines={3} />
      ) : observations.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noObservations")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {observations.map((o) => (
            <li key={o.id} className="card">
              <div className="flex items-center gap-2">
                <Badge tone={o.category === "safe" ? "success" : "warning"}>
                  {t(o.category)}
                </Badge>
                <span className="text-xs text-fg-subtle">{formatDate(new Date(o.observedAt))}</span>
                <span className="text-xs text-fg-subtle">{o.observerName}</span>
              </div>
              <p className="mt-1.5 text-sm text-fg-muted">{o.behaviorObserved}</p>
              {o.correctiveAction && <p className="mt-1 text-xs text-fg-subtle">{t("correctiveActionTaken", { action: o.correctiveAction })}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
