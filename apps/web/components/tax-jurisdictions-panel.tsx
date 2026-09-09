"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface TaxRate {
  id: string;
  ratePercent: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}
interface TaxJurisdiction {
  id: string;
  name: string;
  country: string;
  region: string | null;
  active: boolean;
  rates: TaxRate[];
}

export function TaxJurisdictionsPanel() {
  const t = useTranslations("tax");
  const tc = useTranslations("common");

  const [jurisdictions, setJurisdictions] = useState<TaxJurisdiction[] | null>(null);
  const [form, setForm] = useState({ name: "", country: "", region: "" });
  const [rateForms, setRateForms] = useState<Record<string, { ratePercent: string; effectiveFrom: string }>>({});
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<TaxJurisdiction[]>("/tax/jurisdictions").then(setJurisdictions);
  }
  useEffect(load, []);

  async function createJurisdiction(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.country.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/tax/jurisdictions", {
        method: "POST",
        body: JSON.stringify({ name: form.name.trim(), country: form.country.trim().toUpperCase(), region: form.region || undefined }),
      });
      setForm({ name: "", country: "", region: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function addRate(jurisdictionId: string) {
    const rf = rateForms[jurisdictionId];
    if (!rf?.ratePercent || !rf?.effectiveFrom) return;
    setBusy(true);
    try {
      await apiFetch(`/tax/jurisdictions/${jurisdictionId}/rates`, {
        method: "POST",
        body: JSON.stringify({ ratePercent: Number(rf.ratePercent), effectiveFrom: new Date(rf.effectiveFrom).toISOString() }),
      });
      setRateForms((f) => ({ ...f, [jurisdictionId]: { ratePercent: "", effectiveFrom: "" } }));
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("jurisdictionsTitle")}</h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t("jurisdictionsHint")}</p>

      <form onSubmit={createJurisdiction} className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <input
          required
          placeholder={t("jurisdictionNamePlaceholder")}
          className="input"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          required
          maxLength={2}
          placeholder={t("countryPlaceholder")}
          className="input w-24"
          value={form.country}
          onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
        />
        <input
          placeholder={t("regionPlaceholder")}
          className="input"
          value={form.region}
          onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
        />
        <button type="submit" disabled={busy} className="btn-primary shrink-0">
          {t("addJurisdiction")}
        </button>
      </form>

      {jurisdictions === null ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : jurisdictions.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noJurisdictions")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {jurisdictions.map((j) => {
            const currentRate = j.rates.find((r) => !r.effectiveTo);
            return (
              <li key={j.id} className="card">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-900 dark:text-gray-50">
                    {j.name} <span className="text-xs text-gray-400 dark:text-gray-500">({j.region ? `${j.region}, ` : ""}{j.country})</span>
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{currentRate ? `${currentRate.ratePercent}%` : t("noRateSet")}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max="100"
                    placeholder={t("ratePercentPlaceholder")}
                    className="input w-28"
                    value={rateForms[j.id]?.ratePercent ?? ""}
                    onChange={(e) => setRateForms((f) => ({ ...f, [j.id]: { ratePercent: e.target.value, effectiveFrom: f[j.id]?.effectiveFrom ?? "" } }))}
                  />
                  <input
                    type="date"
                    className="input w-auto"
                    value={rateForms[j.id]?.effectiveFrom ?? ""}
                    onChange={(e) => setRateForms((f) => ({ ...f, [j.id]: { ratePercent: f[j.id]?.ratePercent ?? "", effectiveFrom: e.target.value } }))}
                  />
                  <button onClick={() => addRate(j.id)} disabled={busy} className="btn-secondary shrink-0 px-2.5 py-1 text-xs">
                    {t("addRate")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
