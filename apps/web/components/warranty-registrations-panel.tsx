"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { WARRANTY_COVERAGE_TYPES, type WarrantyCoverageType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";

interface WarrantyRegistration {
  id: string;
  scope: string;
  manufacturer: string | null;
  coverageType: WarrantyCoverageType;
  termMonths: number;
  startDate: string;
  expirationDate: string;
  notes: string | null;
}

export function WarrantyRegistrationsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("warrantyRegistry");
  const tc = useTranslations("common");

  const [registrations, setRegistrations] = useState<WarrantyRegistration[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ scope: "", manufacturer: "", coverageType: "both" as WarrantyCoverageType, termMonths: "", startDate: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<WarrantyRegistration[]>(`/projects/${projectId}/warranty-registrations`).then(setRegistrations);
  }
  useEffect(load, [projectId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.scope.trim() || !form.termMonths || !form.startDate) return;
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/warranty-registrations`, {
        method: "POST",
        body: JSON.stringify({
          scope: form.scope.trim(),
          manufacturer: form.manufacturer || undefined,
          coverageType: form.coverageType,
          termMonths: Number(form.termMonths),
          startDate: new Date(form.startDate).toISOString(),
        }),
      });
      setForm({ scope: "", manufacturer: "", coverageType: "both", termMonths: "", startDate: "" });
      setAdding(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  const now = new Date();

  return (
    <div className="mt-10">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{t("title")}</h2>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn-secondary px-2.5 py-1 text-xs">
            {t("registerWarranty")}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500">{t("hint")}</p>

      {adding && (
        <form onSubmit={create} className="card mb-3 flex flex-wrap items-end gap-2">
          <input
            required
            placeholder={t("scopePlaceholder")}
            className="input"
            value={form.scope}
            onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
          />
          <input
            placeholder={t("manufacturerPlaceholder")}
            className="input"
            value={form.manufacturer}
            onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
          />
          <select className="input" value={form.coverageType} onChange={(e) => setForm((f) => ({ ...f, coverageType: e.target.value as WarrantyCoverageType }))}>
            {WARRANTY_COVERAGE_TYPES.map((c) => (
              <option key={c} value={c}>
                {t(`coverage_${c}`)}
              </option>
            ))}
          </select>
          <input
            required
            type="number"
            min="1"
            placeholder={t("termMonthsPlaceholder")}
            className="input w-32"
            value={form.termMonths}
            onChange={(e) => setForm((f) => ({ ...f, termMonths: e.target.value }))}
          />
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            {t("startDate")}
            <input required type="date" className="input" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          </label>
          <button type="submit" disabled={busy} className="btn-primary">
            {tc("save")}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="btn-secondary">
            {tc("cancel")}
          </button>
        </form>
      )}

      {!registrations ? (
        <p className="text-sm text-gray-500">{tc("loading")}</p>
      ) : registrations.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noRegistrations")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {registrations.map((r) => {
            const expired = new Date(r.expirationDate) < now;
            return (
              <li key={r.id} className="card">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    {r.scope}
                    {r.manufacturer && <span className="ml-1.5 text-xs text-gray-400">({r.manufacturer})</span>}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${expired ? "bg-error-50 text-error-700" : "bg-success-50 text-success-700"}`}>
                    {expired ? t("expired") : t("underWarranty")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {t(`coverage_${r.coverageType}`)} · {t("expiresOn", { date: new Date(r.expirationDate).toLocaleDateString() })}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
