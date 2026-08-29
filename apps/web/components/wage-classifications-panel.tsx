"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

export interface WageClassification {
  id: string;
  trade: string;
  hourlyRate: string;
  fringeRate: string;
  active: boolean;
}

export function WageClassificationsPanel() {
  const t = useTranslations("wageClassifications");
  const tc = useTranslations("common");

  const [classifications, setClassifications] = useState<WageClassification[] | null>(null);
  const [form, setForm] = useState({ trade: "", hourlyRate: "", fringeRate: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<WageClassification[]>("/wage-classifications").then(setClassifications);
  }

  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/wage-classifications", {
        method: "POST",
        body: JSON.stringify({
          trade: form.trade,
          hourlyRate: Number(form.hourlyRate),
          fringeRate: form.fringeRate ? Number(form.fringeRate) : 0,
        }),
      });
      setForm({ trade: "", hourlyRate: "", fringeRate: "" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await apiFetch(`/wage-classifications/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <section id="wage-classifications" className="card">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-4 text-xs text-gray-500">{t("hint")}</p>

      {!classifications ? (
        <p className="text-gray-500">{tc("loading")}</p>
      ) : classifications.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noClassifications")}</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-1.5">
          {classifications.map((wc) => (
            <li key={wc.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-700 dark:text-gray-300">
                {wc.trade} — {Number(wc.hourlyRate).toFixed(2)}/{tc("hour")}
                {Number(wc.fringeRate) > 0 && <span className="text-gray-400"> + {Number(wc.fringeRate).toFixed(2)} {t("fringeAbbr")}</span>}
              </span>
              <button onClick={() => remove(wc.id)} className="text-gray-400 hover:text-error-600">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={create} className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
        <input
          required
          placeholder={t("tradePlaceholder")}
          className="input"
          value={form.trade}
          onChange={(e) => setForm((f) => ({ ...f, trade: e.target.value }))}
        />
        <input
          required
          type="number"
          step="0.01"
          min="0"
          placeholder={t("hourlyRatePlaceholder")}
          className="input w-32"
          value={form.hourlyRate}
          onChange={(e) => setForm((f) => ({ ...f, hourlyRate: e.target.value }))}
        />
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder={t("fringeRatePlaceholder")}
          className="input w-32"
          value={form.fringeRate}
          onChange={(e) => setForm((f) => ({ ...f, fringeRate: e.target.value }))}
        />
        <button type="submit" disabled={busy} className="btn-secondary shrink-0">
          {tc("create")}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-error-600">{error}</p>}
    </section>
  );
}
