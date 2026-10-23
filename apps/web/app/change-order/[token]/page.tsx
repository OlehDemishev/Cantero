"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { PublicLinkError } from "@/components/public-link-error";
import { useCompanyLocale } from "@/components/public-locale";
import { SignaturePad } from "@/components/signature-pad";
import { formatDateTime } from "@/lib/format-date";
import { formatCurrency } from "@/lib/format-currency";

interface PublicLine {
  id: string;
  description: string;
  unit: string;
  quantity: string;
  lineTotal: string;
}
type ClientDecision = "pending" | "approved" | "rejected";
interface PublicChangeOrder {
  /** The client's or company's language — see useCompanyLocale. */
  locale: string;
  id: string;
  number: number;
  title: string;
  description: string | null;
  clientDecision: ClientDecision;
  decisionAt: string | null;
  clientDecisionNote: string | null;
  companyName: string;
  currency: string;
  estimateName: string;
  lines: PublicLine[];
  subtotal: string;
  markupAmount: string;
  taxAmount: string;
  grandTotal: string;
  scheduleImpactDays: number | null;
}

export default function PublicChangeOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useTranslations("estimates");
  const tc = useTranslations("common");

  const [changeOrder, setChangeOrder] = useState<PublicChangeOrder | null>(null);
  const [error, setError] = useState<unknown>(null);
  useCompanyLocale(changeOrder?.locale);
  const [note, setNote] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<PublicChangeOrder>(`/public/change-orders/${token}`)
      .then(setChangeOrder)
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
      await apiFetch(`/public/change-orders/${token}/decision`, {
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

  if (error) return <PublicLinkError error={error} />;

  if (!changeOrder) {
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
          <span className="text-lg font-semibold tracking-tight text-fg">{changeOrder.companyName}</span>
        </div>

        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
            {t("changeOrderFor", { estimateName: changeOrder.estimateName })}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-fg">
            CO-{changeOrder.number} — {changeOrder.title}
          </h1>
          {changeOrder.description && <p className="mt-1 text-sm text-fg-subtle">{changeOrder.description}</p>}

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
              {changeOrder.lines.map((l) => (
                <tr key={l.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">{l.description}</td>
                  <td>
                    {l.quantity} {l.unit}
                  </td>
                  <td className="text-right">
                    {formatCurrency(l.lineTotal, changeOrder.currency)}
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
                {formatCurrency(changeOrder.subtotal, changeOrder.currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-subtle">{t("markupAmount")}</dt>
              <dd>
                {formatCurrency(changeOrder.markupAmount, changeOrder.currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-subtle">{t("taxAmount")}</dt>
              <dd>
                {formatCurrency(changeOrder.taxAmount, changeOrder.currency)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2 font-semibold">
              <dt>{t("grandTotal")}</dt>
              <dd>
                {formatCurrency(changeOrder.grandTotal, changeOrder.currency)}
              </dd>
            </div>
          </dl>

          {changeOrder.scheduleImpactDays !== null && (
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              {t("scheduleImpact")}: {changeOrder.scheduleImpactDays >= 0 ? "+" : ""}
              {changeOrder.scheduleImpactDays} {t("days")}
            </p>
          )}

          {changeOrder.clientDecision === "pending" ? (
            <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-fg-muted">{t("clientNoteOptional")}</span>
                <textarea rows={2} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
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
              {signatureError && <p className="mt-2 text-xs text-danger-fg">{signatureError}</p>}

              <div className="mt-3 flex gap-2">
                <button onClick={() => decide("approved")} disabled={busy} className="btn-primary flex-1">
                  {t("clientApprove")}
                </button>
                <button onClick={() => decide("rejected")} disabled={busy} className="btn-secondary flex-1">
                  {t("clientReject")}
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`mt-6 rounded-lg border-t px-4 py-3 text-sm ${
                changeOrder.clientDecision === "approved"
                  ? "border-success-200 bg-success-50 dark:bg-success-500/15 text-success-fg"
                  : "border-error-200 bg-error-50 dark:bg-error-500/15 text-danger-fg"
              }`}
            >
              {changeOrder.clientDecision === "approved" ? t("clientDecisionThanksApproved") : t("clientDecisionThanksRejected")}
              {changeOrder.decisionAt && (
                <span className="block text-xs opacity-75">{formatDateTime(new Date(changeOrder.decisionAt))}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
