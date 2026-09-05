"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MARKUP_COST_TYPES, type MarkupCostType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";

interface MarkupRule {
  id: string;
  costType: MarkupCostType;
  markupPercent: string;
}

export function MarkupRulesPanel() {
  const t = useTranslations("markupRules");
  const tc = useTranslations("common");

  const [rules, setRules] = useState<MarkupRule[] | null>(null);
  const [form, setForm] = useState({ costType: "materials" as MarkupCostType, markupPercent: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<MarkupRule[]>("/markup-rules").then(setRules);
  }
  useEffect(load, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.markupPercent) return;
    setBusy(true);
    try {
      await apiFetch("/markup-rules", {
        method: "POST",
        body: JSON.stringify({ costType: form.costType, markupPercent: Number(form.markupPercent) }),
      });
      setForm((f) => ({ ...f, markupPercent: "" }));
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await apiFetch(`/markup-rules/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <section className="card">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-4 text-xs text-gray-500">{t("hint")}</p>

      {!rules ? (
        <p className="text-gray-500">{tc("loading")}</p>
      ) : rules.length === 0 ? (
        <p className="mb-4 text-sm text-gray-400">{t("noRules")}</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-1.5">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-700 dark:text-gray-300">
                {t(`costType_${r.costType}`)} — {Number(r.markupPercent).toFixed(2)}%
              </span>
              <button onClick={() => remove(r.id)} className="text-gray-400 hover:text-error-600">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={save} className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
        <select className="input" value={form.costType} onChange={(e) => setForm((f) => ({ ...f, costType: e.target.value as MarkupCostType }))}>
          {MARKUP_COST_TYPES.map((ct) => (
            <option key={ct} value={ct}>
              {t(`costType_${ct}`)}
            </option>
          ))}
        </select>
        <input
          required
          type="number"
          step="0.01"
          min="0"
          placeholder={t("markupPercentPlaceholder")}
          className="input w-32"
          value={form.markupPercent}
          onChange={(e) => setForm((f) => ({ ...f, markupPercent: e.target.value }))}
        />
        <button type="submit" disabled={busy} className="btn-secondary shrink-0">
          {tc("save")}
        </button>
      </form>
    </section>
  );
}
