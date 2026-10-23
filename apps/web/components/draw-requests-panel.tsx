"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DRAW_REQUEST_STATUSES, type DrawRequestStatus } from "@cantero/shared";
import { apiFetch, downloadBlob, notifyApiError } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatDate } from "@/lib/format-date";
import { formatCurrency } from "@/lib/format-currency";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/status-tone";
import { Field } from "@/components/ui/field";

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
      ).catch(notifyApiError);
    }).catch(notifyApiError);
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
        <h2 className="text-sm font-semibold text-fg-muted">{t("title")}</h2>
        {!creating && eligibleInvoices.length > 0 && (
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newDraw")}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-fg-subtle">{t("hint")}</p>

      {creating && (
        <form onSubmit={submitCreate} className="card mb-4 flex flex-col gap-3">
          <Field label={t("invoice")}>
            <select
              required
              className="input"
              value={form.invoiceId}
              onChange={(e) => setForm((f) => ({ ...f, invoiceId: e.target.value }))}
            >
              <option value="">—</option>
              {eligibleInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.number} — {inv.percentComplete}% — {formatCurrency(inv.total, currency)}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-wrap gap-3">
            <Field label={t("periodStart")}>
              <input
                type="date"
                required
                className="input"
                value={form.periodStart}
                onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
              />
            </Field>
            <Field label={t("periodEnd")}>
              <input
                type="date"
                required
                className="input"
                value={form.periodEnd}
                onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
              />
            </Field>
            <Field label={t("lenderName")}>
              <input
                className="input"
                value={form.lenderName}
                onChange={(e) => setForm((f) => ({ ...f, lenderName: e.target.value }))}
              />
            </Field>
            <Field label={t("lenderContactEmail")}>
              <input
                type="email"
                className="input"
                value={form.lenderContactEmail}
                onChange={(e) => setForm((f) => ({ ...f, lenderContactEmail: e.target.value }))}
              />
            </Field>
          </div>
          <Field label={t("notes")}>
            <textarea
              rows={2}
              className="input"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </Field>
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
        <p className="text-sm text-fg-subtle">{t("noDraws")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {draws.map((draw) => (
            <li key={draw.id} className="card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-fg">{t("drawNumber", { number: draw.drawNumber })}</span>
                  <Badge tone={statusTone(draw.status)}>
                    {t(`status_${draw.status}`)}
                  </Badge>
                </div>
                <span className="text-sm font-medium tabular-nums text-fg-muted">
                  {formatCurrency(draw.invoice.total, currency)}
                </span>
              </div>
              <p className="mt-1 text-xs text-fg-subtle">
                {formatDate(new Date(draw.periodStart))} – {formatDate(new Date(draw.periodEnd))}
                {draw.lenderName ? ` · ${draw.lenderName}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select aria-label={tc("status")}
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
