"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FRINGE_FUND_TYPES, type FringeFundType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatCurrency } from "@/lib/format-currency";

interface FringeBenefitFund {
  id: string;
  fundType: FringeFundType;
  name: string;
  ratePerHour: string;
}

export interface WageClassification {
  id: string;
  trade: string;
  hourlyRate: string;
  fringeRate: string;
  apprenticeRatio: string | null;
  active: boolean;
  fringeBenefitFunds: FringeBenefitFund[];
}

export function WageClassificationsPanel() {
  const t = useTranslations("wageClassifications");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [classifications, setClassifications] = useState<WageClassification[] | null>(null);
  const [form, setForm] = useState({ trade: "", hourlyRate: "", fringeRate: "", apprenticeRatio: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fundForm, setFundForm] = useState({ fundType: "pension" as FringeFundType, name: "", ratePerHour: "" });

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
          apprenticeRatio: form.apprenticeRatio || undefined,
        }),
      });
      setForm({ trade: "", hourlyRate: "", fringeRate: "", apprenticeRatio: "" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t("confirmDeleteClassification"))) return;
    await apiFetch(`/wage-classifications/${id}`, { method: "DELETE" });
    load();
  }

  async function addFund(wageClassificationId: string) {
    if (!fundForm.name.trim() || !fundForm.ratePerHour) return;
    await apiFetch(`/wage-classifications/${wageClassificationId}/fringe-funds`, {
      method: "POST",
      body: JSON.stringify({ fundType: fundForm.fundType, name: fundForm.name.trim(), ratePerHour: Number(fundForm.ratePerHour) }),
    });
    setFundForm({ fundType: "pension", name: "", ratePerHour: "" });
    load();
  }

  async function removeFund(id: string) {
    if (!window.confirm(t("confirmDeleteFund"))) return;
    await apiFetch(`/wage-classifications/fringe-funds/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <section className="card">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <p className="mb-4 text-xs text-fg-subtle">{t("hint")}</p>

      {!classifications ? (
        <p className="text-fg-subtle">{tc("loading")}</p>
      ) : classifications.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noClassifications")}</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-1.5">
          {classifications.map((wc) => (
            <li key={wc.id} className="border-b border-gray-50 pb-1.5 text-sm last:border-0 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <button onClick={() => setExpandedId(expandedId === wc.id ? null : wc.id)} className="text-left text-fg-muted hover:underline">
                  {wc.trade} — {formatCurrency(wc.hourlyRate, currency)}/{tc("hour")}
                  {Number(wc.fringeRate) > 0 && <span className="text-fg-subtle"> + {formatCurrency(wc.fringeRate, currency)} {t("fringeAbbr")}</span>}
                  {wc.apprenticeRatio && <span className="ml-1.5 rounded-full bg-brand-50 dark:bg-brand-500/15 px-1.5 py-0.5 text-xs text-brand-700 dark:text-brand-400">{t("ratioAbbr", { ratio: wc.apprenticeRatio })}</span>}
                </button>
                <button onClick={() => remove(wc.id)} className="text-fg-subtle hover:text-danger-fg">
                  ×
                </button>
              </div>

              {expandedId === wc.id && (
                <div className="mt-2 flex flex-col gap-1.5 pl-2">
                  {wc.fringeBenefitFunds.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {wc.fringeBenefitFunds.map((fund) => (
                        <li key={fund.id} className="flex items-center justify-between text-xs text-fg-subtle">
                          <span>
                            {t(`fundType_${fund.fundType}`)}: {fund.name} — {formatCurrency(fund.ratePerHour, currency)}/{tc("hour")}
                          </span>
                          <button onClick={() => removeFund(fund.id)} className="text-fg-subtle hover:text-danger-fg">
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <select className="input py-1 text-xs" value={fundForm.fundType} onChange={(e) => setFundForm((f) => ({ ...f, fundType: e.target.value as FringeFundType }))}>
                      {FRINGE_FUND_TYPES.map((ft) => (
                        <option key={ft} value={ft}>
                          {t(`fundType_${ft}`)}
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder={t("fundNamePlaceholder")}
                      className="input py-1 text-xs"
                      value={fundForm.name}
                      onChange={(e) => setFundForm((f) => ({ ...f, name: e.target.value }))}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={t("fringeRatePlaceholder")}
                      className="input w-24 py-1 text-xs"
                      value={fundForm.ratePerHour}
                      onChange={(e) => setFundForm((f) => ({ ...f, ratePerHour: e.target.value }))}
                    />
                    <button onClick={() => addFund(wc.id)} className="btn-secondary px-2 py-1 text-xs">
                      {t("addFund")}
                    </button>
                  </div>
                </div>
              )}
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
        <input
          placeholder={t("apprenticeRatioPlaceholder")}
          className="input w-28"
          value={form.apprenticeRatio}
          onChange={(e) => setForm((f) => ({ ...f, apprenticeRatio: e.target.value }))}
        />
        <button type="submit" disabled={busy} className="btn-secondary shrink-0">
          {tc("create")}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-danger-fg">{error}</p>}
    </section>
  );
}
