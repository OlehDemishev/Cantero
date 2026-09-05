"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { PrequalificationStatus } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface Prequalification {
  id: string;
  licenseNumber: string | null;
  bondingCapacity: string | null;
  yearsInBusiness: number | null;
  safetyEmrRating: string | null;
  score: number | null;
  status: PrequalificationStatus;
  reviewedByName: string | null;
  reviewedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<PrequalificationStatus, string> = {
  pending: "bg-warning-50 text-warning-700",
  approved: "bg-success-50 text-success-700",
  rejected: "bg-error-50 text-error-700",
};

export function SubcontractorPrequalificationPanel({ subcontractorId }: { subcontractorId: string }) {
  const t = useTranslations("subcontractorPrequalification");
  const tc = useTranslations("common");

  const [cycles, setCycles] = useState<Prequalification[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ licenseNumber: "", bondingCapacity: "", yearsInBusiness: "", safetyEmrRating: "", referencesNotes: "" });
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decideForm, setDecideForm] = useState({ score: "", reviewedByName: "", expiresAt: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Prequalification[]>(`/subcontractors/${subcontractorId}/prequalifications`).then(setCycles);
  }
  useEffect(load, [subcontractorId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/subcontractors/${subcontractorId}/prequalifications`, {
        method: "POST",
        body: JSON.stringify({
          licenseNumber: form.licenseNumber || undefined,
          bondingCapacity: form.bondingCapacity ? Number(form.bondingCapacity) : undefined,
          yearsInBusiness: form.yearsInBusiness ? Number(form.yearsInBusiness) : undefined,
          safetyEmrRating: form.safetyEmrRating ? Number(form.safetyEmrRating) : undefined,
          referencesNotes: form.referencesNotes || undefined,
        }),
      });
      setForm({ licenseNumber: "", bondingCapacity: "", yearsInBusiness: "", safetyEmrRating: "", referencesNotes: "" });
      setAdding(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, status: "approved" | "rejected") {
    if (!decideForm.reviewedByName.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/subcontractor-prequalifications/${id}/decide`, {
        method: "POST",
        body: JSON.stringify({
          status,
          score: decideForm.score ? Number(decideForm.score) : undefined,
          reviewedByName: decideForm.reviewedByName.trim(),
          expiresAt: status === "approved" && decideForm.expiresAt ? new Date(decideForm.expiresAt).toISOString() : undefined,
        }),
      });
      setDecidingId(null);
      setDecideForm({ score: "", reviewedByName: "", expiresAt: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-gray-100 pt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("title")}</h3>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn-secondary px-2 py-0.5 text-xs">
            {t("startCycle")}
          </button>
        )}
      </div>
      <p className="mb-2 text-xs text-gray-400">{t("hint")}</p>

      {adding && (
        <form onSubmit={create} className="mb-3 flex flex-col gap-2 rounded-md border border-gray-200 p-2">
          <div className="flex flex-wrap gap-2">
            <input
              placeholder={t("licenseNumberPlaceholder")}
              className="input"
              value={form.licenseNumber}
              onChange={(e) => setForm((f) => ({ ...f, licenseNumber: e.target.value }))}
            />
            <input
              type="number"
              step="0.01"
              placeholder={t("bondingCapacityPlaceholder")}
              className="input w-36"
              value={form.bondingCapacity}
              onChange={(e) => setForm((f) => ({ ...f, bondingCapacity: e.target.value }))}
            />
            <input
              type="number"
              placeholder={t("yearsInBusinessPlaceholder")}
              className="input w-28"
              value={form.yearsInBusiness}
              onChange={(e) => setForm((f) => ({ ...f, yearsInBusiness: e.target.value }))}
            />
            <input
              type="number"
              step="0.01"
              placeholder={t("safetyEmrPlaceholder")}
              className="input w-28"
              value={form.safetyEmrRating}
              onChange={(e) => setForm((f) => ({ ...f, safetyEmrRating: e.target.value }))}
            />
          </div>
          <textarea
            rows={2}
            placeholder={t("referencesNotesPlaceholder")}
            className="input"
            value={form.referencesNotes}
            onChange={(e) => setForm((f) => ({ ...f, referencesNotes: e.target.value }))}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary px-2.5 py-1 text-xs">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="btn-secondary px-2.5 py-1 text-xs">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {!cycles ? (
        <p className="text-xs text-gray-400">{tc("loading")}</p>
      ) : cycles.length === 0 ? (
        <p className="text-xs text-gray-400">{t("noCycles")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {cycles.map((c) => (
            <li key={c.id} className="text-xs">
              <div className="flex items-center justify-between">
                <span>
                  {formatDate(new Date(c.createdAt))}
                  {c.yearsInBusiness !== null && ` · ${t("yearsInBusinessAbbr", { years: c.yearsInBusiness })}`}
                  {c.score !== null && ` · ${t("scoreAbbr", { score: c.score })}`}
                </span>
                <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLES[c.status]}`}>{t(`status_${c.status}`)}</span>
              </div>
              {c.status === "approved" && c.expiresAt && (
                <p className="mt-0.5 text-gray-400">
                  {t("expiresOn", { date: formatDate(new Date(c.expiresAt)) })}
                </p>
              )}
              {c.status === "pending" &&
                (decidingId === c.id ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      placeholder={t("scorePlaceholder")}
                      className="input w-20 py-0.5 text-xs"
                      value={decideForm.score}
                      onChange={(e) => setDecideForm((f) => ({ ...f, score: e.target.value }))}
                    />
                    <input
                      placeholder={t("reviewedByPlaceholder")}
                      className="input w-32 py-0.5 text-xs"
                      value={decideForm.reviewedByName}
                      onChange={(e) => setDecideForm((f) => ({ ...f, reviewedByName: e.target.value }))}
                    />
                    <input
                      type="date"
                      className="input py-0.5 text-xs"
                      value={decideForm.expiresAt}
                      onChange={(e) => setDecideForm((f) => ({ ...f, expiresAt: e.target.value }))}
                    />
                    <button onClick={() => decide(c.id, "approved")} disabled={busy} className="btn-primary px-2 py-0.5 text-xs">
                      {t("approve")}
                    </button>
                    <button onClick={() => decide(c.id, "rejected")} disabled={busy} className="text-error-700 hover:underline">
                      {t("reject")}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setDecidingId(c.id)} className="mt-1 text-brand-700 hover:underline">
                    {t("decide")}
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
