"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DRAW_REQUEST_STATUSES, type DrawRequestStatus } from "@cantero/shared";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatDate } from "@/lib/format-date";

interface Invoice {
  id: string;
  number: string;
  total: string;
  percentComplete: string | null;
  project: { id: string };
}
interface DrawRequest {
  id: string;
  drawNumber: number;
  periodStart: string;
  periodEnd: string;
  status: DrawRequestStatus;
  lenderName: string | null;
  invoice: { id: string; number: string; total: string };
}

const STATUS_STYLES: Record<DrawRequestStatus, string> = {
  draft: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
  submitted: "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400",
  under_review: "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500",
  approved: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
  funded: "bg-success-600 text-white",
};

const EMPTY_FORM = { invoiceId: "", periodStart: "", periodEnd: "", lenderName: "", lenderContactEmail: "", notes: "" };

/** Wraps a progress-billing invoice into a bank-facing draw request — see DrawRequest's schema
 * doc comment for why this is kept separate from the invoice's own client-facing status. */
export function DrawRequestsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("drawRequests");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [draws, setDraws] = useState<DrawRequest[] | null>(null);
  const [eligibleInvoices, setEligibleInvoices] = useState<Invoice[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<DrawRequest[]>(`/draw-requests?projectId=${projectId}`).then((list) => {
      setDraws(list);
      const wrappedInvoiceIds = new Set(list.map((d) => d.invoice.id));
      apiFetch<Invoice[]>("/invoices").then((all) =>
        setEligibleInvoices(all.filter((i) => i.project.id === projectId && i.percentComplete !== null && !wrappedInvoiceIds.has(i.id))),
      );
    });
  }

  useEffect(load, [projectId]);

  if (draws === null || eligibleInvoices === null) return null;
  if (draws.length === 0 && eligibleInvoices.length === 0) return null;

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/draw-requests", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          invoiceId: form.invoiceId,
          periodStart: new Date(form.periodStart).toISOString(),
          periodEnd: new Date(form.periodEnd).toISOString(),
          lenderName: form.lenderName || undefined,
          lenderContactEmail: form.lenderContactEmail || undefined,
          notes: form.notes || undefined,
        }),
      });
      setForm(EMPTY_FORM);
      setCreating(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(id: string, status: DrawRequestStatus) {
    await apiFetch(`/draw-requests/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    load();
  }

  async function downloadPackage(id: string, drawNumber: number) {
    const blob = await apiFetch<Blob>(`/draw-requests/${id}/package`);
    downloadBlob(blob, `draw-${drawNumber}-package.zip`);
  }

  return (
    <div className="mt-8">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
        {!creating && eligibleInvoices.length > 0 && (
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newDraw")}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      {creating && (
        <form onSubmit={submitCreate} className="card mb-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("invoice")}</span>
            <select
              required
              className="input"
              value={form.invoiceId}
              onChange={(e) => setForm((f) => ({ ...f, invoiceId: e.target.value }))}
            >
              <option value="">—</option>
              {eligibleInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.number} — {inv.percentComplete}% — {inv.total} {currency}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("periodStart")}</span>
              <input
                type="date"
                required
                className="input"
                value={form.periodStart}
                onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("periodEnd")}</span>
              <input
                type="date"
                required
                className="input"
                value={form.periodEnd}
                onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("lenderName")}</span>
              <input
                className="input"
                value={form.lenderName}
                onChange={(e) => setForm((f) => ({ ...f, lenderName: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("lenderContactEmail")}</span>
              <input
                type="email"
                className="input"
                value={form.lenderContactEmail}
                onChange={(e) => setForm((f) => ({ ...f, lenderContactEmail: e.target.value }))}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("notes")}</span>
            <textarea
              rows={2}
              className="input"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
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

      {draws.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noDraws")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {draws.map((draw) => (
            <li key={draw.id} className="card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800 dark:text-white/90">{t("drawNumber", { number: draw.drawNumber })}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[draw.status]}`}>
                    {t(`status_${draw.status}`)}
                  </span>
                </div>
                <span className="text-sm font-medium tabular-nums text-gray-700 dark:text-gray-200">
                  {draw.invoice.total} {currency}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {formatDate(new Date(draw.periodStart))} – {formatDate(new Date(draw.periodEnd))}
                {draw.lenderName ? ` · ${draw.lenderName}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  className="input w-auto py-1 text-xs"
                  value={draw.status}
                  onChange={(e) => changeStatus(draw.id, e.target.value as DrawRequestStatus)}
                >
                  {DRAW_REQUEST_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`status_${s}`)}
                    </option>
                  ))}
                </select>
                <button onClick={() => downloadPackage(draw.id, draw.drawNumber)} className="btn-secondary px-3 py-1 text-xs">
                  {t("downloadPackage")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
