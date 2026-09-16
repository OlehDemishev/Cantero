"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";

interface UnitOfMeasure {
  id: string;
  code: string;
  name: string;
  baseUnitId: string | null;
  factorToBase: string | null;
}

const EMPTY_FORM = { code: "", name: "", baseUnitId: "", factorToBase: "" };

export default function UnitsOfMeasurePage() {
  const t = useTranslations("unitsOfMeasure");
  const tc = useTranslations("common");

  const [units, setUnits] = useState<UnitOfMeasure[] | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<UnitOfMeasure[]>("/materials/units-of-measure").then(setUnits);
  }

  useEffect(load, []);

  const baseUnits = (units ?? []).filter((u) => u.baseUnitId === null);
  const unitById = new Map((units ?? []).map((u) => [u.id, u]));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/materials/units-of-measure", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          baseUnitId: form.baseUnitId || undefined,
          factorToBase: form.baseUnitId && form.factorToBase ? Number(form.factorToBase) : undefined,
        }),
      });
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await apiFetch(`/materials/units-of-measure/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    }
  }

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("hint")}</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("code")}
          <input
            required
            className="input w-28"
            placeholder="kg"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("name")}
          <input
            required
            className="input w-48"
            placeholder="Kilogram"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("baseUnit")}
          <select
            className="input w-auto"
            value={form.baseUnitId}
            onChange={(e) => setForm((f) => ({ ...f, baseUnitId: e.target.value }))}
          >
            <option value="">{t("baseUnitNone")}</option>
            {baseUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} — {u.name}
              </option>
            ))}
          </select>
        </label>
        {form.baseUnitId && (
          <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
            {t("factor")}
            <input
              type="number"
              step="0.000001"
              min="0"
              className="input w-24"
              value={form.factorToBase}
              onChange={(e) => setForm((f) => ({ ...f, factorToBase: e.target.value }))}
            />
          </label>
        )}
        <button type="submit" disabled={submitting} className="btn-primary">
          {t("newUnit")}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-error-600">{error}</p>}

      <div className="mt-6 overflow-x-auto">
        {!units ? (
          <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-2">{t("code")}</th>
                <th>{t("name")}</th>
                <th>{t("baseUnit")}</th>
                <th>{t("factor")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 font-medium">{u.code}</td>
                  <td>{u.name}</td>
                  <td className="text-gray-500 dark:text-gray-400">
                    {u.baseUnitId ? unitById.get(u.baseUnitId)?.code ?? "—" : t("baseUnitNone")}
                  </td>
                  <td className="text-gray-500 dark:text-gray-400">{u.factorToBase ?? "—"}</td>
                  <td className="text-right">
                    <button
                      onClick={() => handleDelete(u.id)}
                      className="text-xs text-gray-400 dark:text-gray-500 hover:text-error-600"
                    >
                      {tc("delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AuthenticatedShell>
  );
}
