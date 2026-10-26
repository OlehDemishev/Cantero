"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ProgressBillingPanel } from "@/components/progress-billing-panel";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { fetchClientLink } from "@/lib/client-link";
import { useCan } from "@/lib/permissions";
import { useMe } from "@/lib/use-me";
import { formatCurrency } from "@/lib/format-currency";
import { CoverLetterEditor } from "./cover-letter-editor";
import { SaveAsTemplateForm } from "./save-as-template-form";
import type { EstimateSectionProps } from "./types";

/** The totals and everything done with the estimate: approve, invoice, send, PDF, client link. */
export function SummarySidebar({ onApproved, ...props }: EstimateSectionProps & { onApproved: () => void }) {
  const { estimateId, estimate, currency, busy, setBusy, reload } = props;
  const t = useTranslations("estimates");
  const tc = useTranslations("common");
  const router = useRouter();
  const { data: me } = useMe();
  const can = useCan();
  const [linkCopied, setLinkCopied] = useState(false);
  /** Fetched on the first copy — list/get responses don't carry the client's token. */
  const [clientLink, setClientLink] = useState<string | null>(null);
  const [emailSentTo, setEmailSentTo] = useState<string | null | undefined>(undefined);

  async function approve() {
    setBusy(true);
    try {
      await apiFetch(`/estimates/${estimateId}/approve`, { method: "POST" });
      reload();
      onApproved();
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setLinkCopied(false);
    setClientLink(null);
    try {
      const result = await apiFetch<{ emailSentTo: string | null }>(`/estimates/${estimateId}/send`, { method: "POST" });
      setEmailSentTo(result.emailSentTo);
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    const link = clientLink ?? (await fetchClientLink(`/estimates/${estimateId}/client-link`, "estimate"));
    setClientLink(link);
    await navigator.clipboard.writeText(link);
    setLinkCopied(true);
  }

  async function downloadPdf() {
    const blob = await apiFetch<Blob>(`/estimates/${estimateId}/pdf`);
    downloadBlob(blob, `${estimate?.name ?? "estimate"}.pdf`);
  }

  async function generateInvoice() {
    setBusy(true);
    try {
      const invoice = await apiFetch<{ id: string }>("/invoices/from-estimate", {
        method: "POST",
        body: JSON.stringify({ estimateId }),
      });
      router.push(`/invoices/${invoice.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card lg:col-span-1 h-fit">
      <dl className="flex flex-col gap-2 text-sm">
        <Row label={t("materialsCost")} value={`${formatCurrency(estimate.materialsCostTotal, currency)}`} />
        <Row label={t("laborCost")} value={`${formatCurrency(estimate.laborCostTotal, currency)}`} />
        <Row label={t("subtotal")} value={`${formatCurrency(estimate.subtotal, currency)}`} />
        <Row label={`${t("markupAmount")} (${estimate.markupPercent}%)`} value={`${formatCurrency(estimate.markupAmount, currency)}`} />
        <Row label={`${t("taxAmount")} (${estimate.taxPercent}%)`} value={`${formatCurrency(estimate.taxAmount, currency)}`} />
        <Row label={t("grandTotal")} value={`${formatCurrency(estimate.grandTotal, currency)}`} emphasize />
      </dl>

      <div className="mt-6 flex flex-col gap-2">
        {estimate.status === "draft" && (
          <button onClick={approve} disabled={busy || estimate.lines.length === 0} className="btn-primary">
            {t("approve")}
          </button>
        )}
        {estimate.status === "pending_approval" &&
          (estimate.approvals.some((a) => a.userId === me?.user.id) ? (
            <p className="text-xs text-fg-subtle">{t("alreadyApprovedByYou")}</p>
          ) : (
            <button onClick={approve} disabled={busy} className="btn-primary">
              {t("approveStep")}
            </button>
          ))}
        {estimate.status === "approved" && (
          <button onClick={generateInvoice} disabled={busy} className="btn-primary">
            {t("generateInvoice")}
          </button>
        )}
        {estimate.status === "approved" && (
          <button onClick={send} disabled={busy} className="btn-secondary">
            {estimate.sentAt ? t("resend") : t("sendToClient")}
          </button>
        )}
        <button onClick={downloadPdf} className="btn-secondary">
          {t("downloadPdf")}
        </button>
        {estimate.status === "draft" && <p className="text-xs text-fg-subtle">{t("approveFirst")}</p>}
      </div>

      {estimate.status === "draft" && <CoverLetterEditor {...props} />}

      {estimate.status === "approved" && <ProgressBillingPanel estimateId={estimateId} currency={currency} />}

      {estimate.sentAt && can("estimates.manage") && (
        <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4">
          <span className="text-xs font-medium text-fg-subtle">{t("clientLink")}</span>
          <div className="mt-2 flex items-center gap-2">
            {clientLink && <input aria-label={t("clientLink")} readOnly className="input flex-1 text-xs" value={clientLink} />}
            <button onClick={copyLink} className="btn-secondary shrink-0 px-3 py-1 text-xs">
              {linkCopied ? tc("saved") : t("copyLink")}
            </button>
          </div>
          {emailSentTo !== undefined && (
            <p className="mt-2 text-xs text-fg-subtle">
              {emailSentTo ? tc("emailedTo", { email: emailSentTo }) : tc("noClientEmail")}
            </p>
          )}
        </div>
      )}

      <SaveAsTemplateForm {...props} />
    </div>
  );
}

function Row({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className={`flex justify-between ${emphasize ? "border-t border-gray-200 dark:border-gray-700 pt-2 font-semibold" : ""}`}>
      <dt className="text-fg-subtle">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
