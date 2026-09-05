"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ObservationCategory } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { PrintButton } from "@/components/ui/print-button";
import { formatDate } from "@/lib/format-date";

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

  const [observations, setObservations] = useState<Observation[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ category: "safe" as ObservationCategory, behaviorObserved: "", correctiveAction: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Observation[]>(`/safety/observations?projectId=${projectId}`).then(setObservations);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

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
        <h2 className="text-sm font-semibold text-gray-700">{t("title")}</h2>
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
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("category")}</span>
            <select
              className="input"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ObservationCategory }))}
            >
              <option value="safe">{t("safe")}</option>
              <option value="at_risk">{t("at_risk")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("behaviorObserved")}</span>
            <textarea
              required
              rows={2}
              className="input"
              value={form.behaviorObserved}
              onChange={(e) => setForm((f) => ({ ...f, behaviorObserved: e.target.value }))}
            />
          </label>
          {form.category === "at_risk" && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("correctiveAction")}</span>
              <textarea
                required
                rows={2}
                className="input"
                value={form.correctiveAction}
                onChange={(e) => setForm((f) => ({ ...f, correctiveAction: e.target.value }))}
              />
            </label>
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
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : observations.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noObservations")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {observations.map((o) => (
            <li key={o.id} className="card">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    o.category === "safe" ? "bg-success-50 text-success-700" : "bg-warning-50 text-warning-700"
                  }`}
                >
                  {t(o.category)}
                </span>
                <span className="text-xs text-gray-500">{formatDate(new Date(o.observedAt))}</span>
                <span className="text-xs text-gray-500">{o.observerName}</span>
              </div>
              <p className="mt-1.5 text-sm text-gray-700">{o.behaviorObserved}</p>
              {o.correctiveAction && <p className="mt-1 text-xs text-gray-500">{t("correctiveActionTaken", { action: o.correctiveAction })}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
