"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useReloadOnVersion } from "./use-reload-on-version";
import type { SubcontractorPayment, SubcontractorSectionProps, TaxProfile } from "./types";

/** The DATEV Kreditor number and, for a US company, the 1099 tax profile and payment log. */
export function TaxPaymentsSection({ subcontractor: s, isUsCompany, busy, setBusy, version, refresh, onChanged }: SubcontractorSectionProps & { isUsCompany: boolean }) {
  const t = useTranslations("subcontractorCompliance");
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");
  const [taxForm, setTaxForm] = useState({ taxId: "", legalBusinessName: "", mailingAddress: "", datevKreditorNumber: "" });
  const {
    data: payments = null,
    error: paymentsError,
    reload: reloadPayments,
  } = useApi<SubcontractorPayment[]>(isUsCompany ? `/finance/subcontractors/${s.id}/payments` : null);
  useReloadOnVersion(version, reloadPayments);
  const [paymentForm, setPaymentForm] = useState({ amount: "", paidAt: "", note: "" });

  useEffect(() => {
    // Tax profile carries both US 1099 fields and the DATEV Kreditor number, so it's fetched
    // regardless of isUsCompany — only the US-specific inputs/payments ledger below stay gated.
    apiFetch<TaxProfile>(`/finance/subcontractors/${s.id}/tax-profile`).then((p) =>
      setTaxForm({
        taxId: p.taxId ?? "",
        legalBusinessName: p.legalBusinessName ?? "",
        mailingAddress: p.mailingAddress ?? "",
        datevKreditorNumber: p.datevKreditorNumber ?? "",
      }),
    ).catch(notifyApiError);
  }, [s.id, version]);

  async function saveTaxProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${s.id}/tax-profile`, {
        method: "PATCH",
        body: JSON.stringify({
          taxId: taxForm.taxId || null,
          legalBusinessName: taxForm.legalBusinessName || null,
          mailingAddress: taxForm.mailingAddress || null,
          datevKreditorNumber: taxForm.datevKreditorNumber || null,
        }),
      });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentForm.amount) return;
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${s.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(paymentForm.amount),
          paidAt: paymentForm.paidAt ? new Date(paymentForm.paidAt).toISOString() : undefined,
          note: paymentForm.note || undefined,
        }),
      });
      setPaymentForm({ amount: "", paidAt: "", note: "" });
      refresh();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("datevSettings")}</h3>
        <p className="mb-2 text-xs text-fg-subtle">{t("datevKreditorNumberHint")}</p>
        <form onSubmit={saveTaxProfile} className="flex flex-col gap-2">
          <input
            placeholder={t("datevKreditorNumber")} aria-label={t("datevKreditorNumber")}
            className="input"
            value={taxForm.datevKreditorNumber}
            onChange={(e) => setTaxForm((f) => ({ ...f, datevKreditorNumber: e.target.value.replace(/\D/g, "") }))}
          />
          <button type="submit" disabled={busy} className="btn-secondary self-start px-2.5 py-1 text-xs">
            {tc("save")}
          </button>
        </form>
      </div>

      {isUsCompany && (
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("taxProfile")}</h3>
          <p className="mb-2 text-xs text-fg-subtle">{t("taxProfileHint")}</p>
          <form onSubmit={saveTaxProfile} className="flex flex-col gap-2">
            <input
              placeholder={t("taxIdPlaceholder")} aria-label={t("taxIdPlaceholder")}
              className="input"
              value={taxForm.taxId}
              onChange={(e) => setTaxForm((f) => ({ ...f, taxId: e.target.value }))}
            />
            <input
              placeholder={t("legalBusinessNamePlaceholder")} aria-label={t("legalBusinessNamePlaceholder")}
              className="input"
              value={taxForm.legalBusinessName}
              onChange={(e) => setTaxForm((f) => ({ ...f, legalBusinessName: e.target.value }))}
            />
            <textarea
              rows={2}
              placeholder={t("mailingAddressPlaceholder")} aria-label={t("mailingAddressPlaceholder")}
              className="input"
              value={taxForm.mailingAddress}
              onChange={(e) => setTaxForm((f) => ({ ...f, mailingAddress: e.target.value }))}
            />
            <button type="submit" disabled={busy} className="btn-secondary self-start px-2.5 py-1 text-xs">
              {tc("save")}
            </button>
          </form>

          <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("payments")}</h3>
          {payments === null ? (
            paymentsError ? <ErrorState error={paymentsError} onRetry={reloadPayments} compact /> : <Skeleton lines={3} />
          ) : payments.length === 0 ? (
            <p className="mb-2 text-xs text-fg-subtle">{t("noPayments")}</p>
          ) : (
            <ul className="mb-2 flex flex-col gap-1">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-xs">
                  <span className="text-fg-subtle">
                    {formatDate(new Date(p.paidAt))}
                    {p.note && ` · ${p.note}`}
                  </span>
                  <span className="font-medium">{p.amount}</span>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addPayment} className="flex flex-wrap items-end gap-2">
            <input
              required
              type="number"
              step="0.01"
              placeholder={t("amount")} aria-label={t("amount")}
              className="input w-28"
              value={paymentForm.amount}
              onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
            />
            <input aria-label={ta("paymentDate")}
              type="date"
              className="input w-auto"
              value={paymentForm.paidAt}
              onChange={(e) => setPaymentForm((f) => ({ ...f, paidAt: e.target.value }))}
            />
            <input
              placeholder={t("paymentNotePlaceholder")} aria-label={t("paymentNotePlaceholder")}
              className="input"
              value={paymentForm.note}
              onChange={(e) => setPaymentForm((f) => ({ ...f, note: e.target.value }))}
            />
            <button type="submit" disabled={busy} className="btn-secondary px-2.5 py-1 text-xs">
              {t("recordPayment")}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
