"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api-client";

interface CompanyHoliday {
  id: string;
  date: string;
  label: string;
}

export function CompanyHolidaysPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [holidays, setHolidays] = useState<CompanyHoliday[] | null>(null);
  const [form, setForm] = useState({ date: "", label: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<CompanyHoliday[]>("/company/holidays").then(setHolidays);
  }

  useEffect(load, []);

  async function submit() {
    if (!form.date || !form.label.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/company/holidays", {
        method: "POST",
        body: JSON.stringify({ date: new Date(form.date).toISOString(), label: form.label }),
      });
      setForm({ date: "", label: "" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("holidaysError"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/company/holidays/${id}`, { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-gray-100 pt-3">
      <p className="mb-1 text-xs font-medium text-gray-700">{t("holidays")}</p>
      <p className="mb-2 text-xs text-gray-500">{t("holidaysHint")}</p>

      {holidays === null ? (
        <p className="text-xs text-gray-400">{tc("loading")}</p>
      ) : holidays.length === 0 ? (
        <p className="text-xs text-gray-400">{t("noHolidays")}</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-1.5">
          {holidays.map((h) => (
            <li key={h.id} className="flex items-center justify-between rounded-md border border-gray-200 px-2.5 py-1.5 text-xs">
              <span>
                <span className="font-medium text-gray-800">{new Date(h.date).toLocaleDateString()}</span>
                <span className="ml-2 text-gray-500">{h.label}</span>
              </span>
              {canManage && (
                <button onClick={() => remove(h.id)} disabled={busy} className="text-gray-400 hover:text-error-700">
                  {tc("delete")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            {t("holidayDate")}
            <input
              type="date"
              className="input"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-gray-500">
            {t("holidayLabel")}
            <input
              className="input"
              placeholder={t("holidayLabelPlaceholder")}
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            />
          </label>
          <button type="button" onClick={submit} disabled={busy} className="btn-secondary px-3 py-1.5 text-xs">
            {t("addHoliday")}
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-error-700">{error}</p>}
    </div>
  );
}
