"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/format-date";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FormError } from "@/components/ui/field";

interface CompanyHoliday {
  id: string;
  date: string;
  label: string;
}

export function CompanyHolidaysPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("settings");
  const confirm = useConfirm();
  const td = useTranslations("dialog");
  const tc = useTranslations("common");
  const { data: holidays = null, reload: reloadHolidays } = useApi<CompanyHoliday[]>("/company/holidays");
  const [form, setForm] = useState({ date: "", label: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    void reloadHolidays();
  }

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
    if (!(await confirm({ message: td("deleteHoliday"), tone: "danger", verb: "delete" }))) return;
    setBusy(true);
    try {
      await apiFetch(`/company/holidays/${id}`, { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
      <p className="mb-1 text-xs font-medium text-fg-muted">{t("holidays")}</p>
      <p className="mb-2 text-xs text-fg-subtle">{t("holidaysHint")}</p>

      {holidays === null ? (
        <p className="text-xs text-fg-subtle">{tc("loading")}</p>
      ) : holidays.length === 0 ? (
        <p className="text-xs text-fg-subtle">{t("noHolidays")}</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-1.5">
          {holidays.map((h) => (
            <li key={h.id} className="flex items-center justify-between rounded-md border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs">
              <span>
                <span className="font-medium text-fg">{formatDate(new Date(h.date))}</span>
                <span className="ml-2 text-fg-subtle">{h.label}</span>
              </span>
              {canManage && (
                <button onClick={() => remove(h.id)} disabled={busy} className="text-fg-subtle hover:text-danger-fg">
                  {tc("delete")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
            {t("holidayDate")}
            <input
              type="date"
              className="input"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-fg-subtle">
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
      {error && <FormError className="mt-1">{error}</FormError>}
    </div>
  );
}
