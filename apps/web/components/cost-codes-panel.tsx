"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

export interface CostCode {
  id: string;
  code: string;
  name: string;
}

export function CostCodesPanel() {
  const t = useTranslations("costCodes");
  const tc = useTranslations("common");

  const [costCodes, setCostCodes] = useState<CostCode[] | null>(null);
  const [form, setForm] = useState({ code: "", name: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<CostCode[]>("/cost-codes").then(setCostCodes);
  }

  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/cost-codes", { method: "POST", body: JSON.stringify(form) });
      setForm({ code: "", name: "" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await apiFetch(`/cost-codes/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <section className="card">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-4 text-xs text-gray-500">{t("hint")}</p>

      {!costCodes ? (
        <p className="text-gray-500">{tc("loading")}</p>
      ) : costCodes.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noCostCodes")}</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-1.5">
          {costCodes.map((cc) => (
            <li key={cc.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-700 dark:text-gray-300">
                <span className="font-mono text-xs text-gray-400">{cc.code}</span> {cc.name}
              </span>
              <button onClick={() => remove(cc.id)} className="text-gray-400 hover:text-error-600">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={create} className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
        <input
          required
          placeholder={t("codePlaceholder")}
          className="input w-28"
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
        />
        <input
          required
          placeholder={t("namePlaceholder")}
          className="input"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <button type="submit" disabled={busy} className="btn-secondary shrink-0">
          {tc("create")}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-error-600">{error}</p>}
    </section>
  );
}
