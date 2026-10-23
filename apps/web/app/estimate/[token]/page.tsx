"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { PublicLinkError } from "@/components/public-link-error";
import { useCompanyLocale } from "@/components/public-locale";
import { SignaturePad } from "@/components/signature-pad";
import { formatDateTime } from "@/lib/format-date";
import { formatCurrency } from "@/lib/format-currency";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { FormError } from "@/components/ui/field";

interface PublicLine {
  id: string;
  description: string;
  unit: string;
  quantity: string;
  lineTotal: string;
}
type ClientDecision = "pending" | "approved" | "rejected" | "countered";
interface PublicEstimate {
  /** The client's or company's language — see useCompanyLocale. */
  locale: string;
  id: string;
  name: string;
  variantLabel: string | null;
  clientDecision: ClientDecision;
  decisionAt: string | null;
  clientDecisionNote: string | null;
  counterOfferAmount: string | null;
  companyName: string;
  currency: string;
  projectName: string | null;
  lines: PublicLine[];
  subtotal: string;
  markupAmount: string;
  taxAmount: string;
  grandTotal: string;
}

export default function PublicEstimatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useTranslations("estimates");
  const tc = useTranslations("common");

  const [estimate, setEstimate] = useState<PublicEstimate | null>(null);
  const [error, setError] = useState<unknown>(null);
  useCompanyLocale(estimate?.locale);
  const [note, setNote] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [counterMode, setCounterMode] = useState(false);
  const [counterAmount, setCounterAmount] = useState("");

  function load() {
    apiFetch<PublicEstimate>(`/public/estimates/${token}`)
      .then(setEstimate)
      .catch(setError);
  }

  useEffect(load, [token]);

  async function decide(decision: "approved" | "rejected") {
    if (decision === "approved" && (!signerName.trim() || !signatureDataUrl)) {
      setSignatureError(t("signatureRequired"));
      return;
    }
    setSignatureError(null);
    setBusy(true);
    try {
      await apiFetch(`/public/estimates/${token}/decision`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          note: note || undefined,
          signerName: decision === "approved" ? signerName.trim() : undefined,
          signatureDataUrl: decision === "approved" ? signatureDataUrl : undefined,
        }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function decideCounter() {
    const amount = Number(counterAmount);
    if (!amount || amount <= 0) return;
    setBusy(true);
    try {
      await apiFetch(`/public/estimates/${token}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision: "countered", counterOfferAmount: amount, note: note || undefined }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  if (error) return <PublicLinkError error={error} />;

  if (!estimate) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
        <p className="text-sm text-fg-subtle">{tc("loading")}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">
            C
          </span>
          <span className="text-lg font-semibold tracking-tight text-fg">{estimate.companyName}</span>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-fg">
              {estimate.name}
              {estimate.variantLabel && (
                <Badge tone="brand" className="ml-2 align-middle">
                  {estimate.variantLabel}
                </Badge>
              )}
            </h1>
          </div>
          {estimate.projectName && <p className="mt-1 text-sm text-fg-subtle">{estimate.projectName}</p>}

          <div className="overflow-x-auto">
          <table className="mt-6 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                <th className="py-2">{t("rateItem")}</th>
                <th>{t("quantity")}</th>
                <th className="text-right">{t("lineTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {estimate.lines.map((l) => (
                <tr key={l.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">{l.description}</td>
                  <td>
                    {l.quantity} {l.unit}
                  </td>
                  <td className="text-right">
                    {formatCurrency(l.lineTotal, estimate.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <dl className="mt-4 flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-fg-subtle">{t("subtotal")}</dt>
              <dd>
                {formatCurrency(estimate.subtotal, estimate.currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-subtle">{t("markupAmount")}</dt>
              <dd>
                {formatCurrency(estimate.markupAmount, estimate.currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-subtle">{t("taxAmount")}</dt>
              <dd>
                {formatCurrency(estimate.taxAmount, estimate.currency)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2 font-semibold">
              <dt>{t("grandTotal")}</dt>
              <dd>
                {formatCurrency(estimate.grandTotal, estimate.currency)}
              </dd>
            </div>
          </dl>

          {estimate.clientDecision === "pending" ? (
            <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-fg-muted">{t("clientNoteOptional")}</span>
                <textarea
                  rows={2}
                  className="input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>

              <div className="mt-4 flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-fg-muted">{t("signerNameLabel")}</span>
                <input
                  className="input"
                  placeholder={t("signerNamePlaceholder")}
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                />
              </div>
              <div className="mt-3 flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-fg-muted">{t("signHere")}</span>
                <SignaturePad onChange={setSignatureDataUrl} clearLabel={t("clearSignature")} />
              </div>
              {signatureError && <FormError className="mt-2">{signatureError}</FormError>}

              {counterMode ? (
                <div className="mt-3 rounded-lg bg-gray-50 dark:bg-gray-700 p-3">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-fg-muted">
                      {t("counterOfferAmountLabel")} ({estimate.currency})
                    </span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      className="input"
                      value={counterAmount}
                      onChange={(e) => setCounterAmount(e.target.value)}
                    />
                  </label>
                  <div className="mt-3 flex gap-2">
                    <button onClick={decideCounter} disabled={busy || !counterAmount} className="btn-primary flex-1">
                      {t("sendCounterOffer")}
                    </button>
                    <button onClick={() => setCounterMode(false)} className="btn-secondary flex-1">
                      {tc("cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button onClick={() => decide("approved")} disabled={busy} className="btn-primary flex-1">
                      {t("clientApprove")}
                    </button>
                    <button onClick={() => decide("rejected")} disabled={busy} className="btn-secondary flex-1">
                      {t("clientReject")}
                    </button>
                  </div>
                  <button onClick={() => setCounterMode(true)} disabled={busy} className="text-xs text-brand-700 dark:text-brand-400 hover:underline">
                    {t("proposeDifferentPrice")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Alert tone={estimate.clientDecision === "approved" ? "success" : estimate.clientDecision === "countered" ? "brand" : "danger"} className="mt-6" role="status">
              {estimate.clientDecision === "approved"
                ? t("clientDecisionThanksApproved")
                : estimate.clientDecision === "countered"
                  ? t("clientDecisionThanksCountered", { amount: formatCurrency(estimate.counterOfferAmount, estimate.currency) })
                  : t("clientDecisionThanksRejected")}
              {estimate.decisionAt && (
                <span className="block text-xs opacity-75">{formatDateTime(new Date(estimate.decisionAt))}</span>
              )}
            </Alert>
          )}
        </div>
      </div>
    </main>
  );
}
