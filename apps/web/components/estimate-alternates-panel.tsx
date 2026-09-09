"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { EstimateAlternateStatus } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";

interface Alternate {
  id: string;
  title: string;
  description: string | null;
  amount: string;
  status: EstimateAlternateStatus;
}
interface AlternatesResponse {
  alternates: Alternate[];
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
  acceptedTotal: number;
}

const STATUS_STYLES: Record<EstimateAlternateStatus, string> = {
  pending: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
  accepted: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
  rejected: "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500",
};

export function EstimateAlternatesPanel({ estimateId, currency }: { estimateId: string; currency: string }) {
  const t = useTranslations("estimateAlternates");
  const tc = useTranslations("common");

  const [data, setData] = useState<AlternatesResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", amount: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<AlternatesResponse>(`/estimates/${estimateId}/alternates`).then(setData);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/estimates/${estimateId}/alternates`, {
        method: "POST",
        body: JSON.stringify({ title: form.title, description: form.description || undefined, amount: Number(form.amount) }),
      });
      setForm({ title: "", description: "", amount: "" });
      setCreating(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, status: "accepted" | "rejected") {
    await apiFetch(`/estimate-alternates/${id}/decide`, { method: "POST", body: JSON.stringify({ status }) });
    load();
  }

  return (
    <div className="mt-10">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newAlternate")}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      {creating && (
        <form onSubmit={submit} className="card mb-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("alternateTitle")}</span>
            <input required className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </label>
          <label className="flex w-48 flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("amount")}</span>
            <input
              required
              type="number"
              step="0.01"
              className="input"
              placeholder={t("amountHint")}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{tc("notes")}</span>
            <textarea rows={2} className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {data === null ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : data.alternates.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noAlternates")}</p>
      ) : (
        <>
          {data.acceptedCount > 0 && (
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("acceptedTotal", { amount: data.acceptedTotal, currency })}</p>
          )}
          <ul className="flex flex-col gap-2">
            {data.alternates.map((a) => (
              <li key={a.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{a.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[a.status]}`}>{t(a.status)}</span>
                    </div>
                    {a.description && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{a.description}</p>}
                  </div>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${Number(a.amount) < 0 ? "text-success-700 dark:text-success-500" : "text-gray-900 dark:text-gray-50"}`}>
                    {Number(a.amount) > 0 ? "+" : ""}
                    {a.amount} {currency}
                  </span>
                </div>
                {a.status === "pending" && (
                  <div className="mt-3 flex gap-1.5 border-t border-gray-100 dark:border-gray-700 pt-3">
                    <button onClick={() => decide(a.id, "accepted")} className="btn-primary px-2.5 py-1 text-xs">
                      {t("accept")}
                    </button>
                    <button onClick={() => decide(a.id, "rejected")} className="btn-secondary px-2.5 py-1 text-xs">
                      {t("reject")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
