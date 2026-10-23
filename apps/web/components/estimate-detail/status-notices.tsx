"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatDateTime } from "@/lib/format-date";
import { formatCurrency } from "@/lib/format-currency";
import { Alert } from "@/components/ui/alert";
import type { EstimateSectionProps } from "./types";

/** Where the estimate stands: approval progress, the client's note or counter-offer, the signature. */
export function StatusNotices({ estimateId, estimate, busy, setBusy }: EstimateSectionProps) {
  const t = useTranslations("estimates");
  const router = useRouter();
  const { data: me } = useMe();
  const [estimateSignatureUrl, setEstimateSignatureUrl] = useState<string | null>(null);

  // Fetched again with every load of an estimate the client has signed.
  useEffect(() => {
    if (estimate.clientDecision === "approved" && estimate.signerName) {
      apiFetch<Blob>(`/estimates/${estimateId}/signature`)
        .then((blob) => setEstimateSignatureUrl(URL.createObjectURL(blob)))
        .catch(() => setEstimateSignatureUrl(null));
    }
  }, [estimateId, estimate]);

  async function createRevisedVariant() {
    setBusy(true);
    try {
      const created = await apiFetch<{ id: string }>(`/estimates/${estimateId}/create-variant`, {
        method: "POST",
        body: JSON.stringify({ label: t("revisedVariantLabel") }),
      });
      router.push(`/estimates/${created.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {estimate.status === "pending_approval" && me?.company.requiredApprovalCount && (
        <Alert tone="warning" className="mt-2">
          <p className="text-sm text-warning-fg">
            {t("approvalProgress", { count: estimate.approvals.length, required: me.company.requiredApprovalCount })}
          </p>
          <p className="mt-1 text-xs text-warning-fg">
            {estimate.approvals.map((a) => a.actorName).join(", ")}
          </p>
        </Alert>
      )}
      {estimate.clientDecision === "rejected" && estimate.clientDecisionNote && (
        <p className="mt-2 text-sm text-danger-fg">
          {t("clientNote")}: {estimate.clientDecisionNote}
        </p>
      )}
      {estimate.clientDecision === "countered" && (
        <Alert tone="brand" className="mt-2">
          <p className="text-sm font-medium text-brand-700 dark:text-brand-400">
            {t("counterOfferReceived", { amount: formatCurrency(estimate.counterOfferAmount, estimate.currency) })}
          </p>
          {estimate.clientDecisionNote && <p className="mt-1 text-sm text-brand-700 dark:text-brand-400">{estimate.clientDecisionNote}</p>}
          <button onClick={createRevisedVariant} disabled={busy} className="btn-secondary mt-2 px-3 py-1 text-xs">
            {t("createRevisedVariant")}
          </button>
        </Alert>
      )}
      {estimate.clientDecision === "approved" && estimate.signerName && (
        <div className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          {estimateSignatureUrl && (
            <img src={estimateSignatureUrl} alt={t("signature")} className="h-8 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-1" />
          )}
          <span>
            {t("signedBy", { name: estimate.signerName })}
            {estimate.decisionAt && ` · ${formatDateTime(new Date(estimate.decisionAt))}`}
          </span>
        </div>
      )}
    </>
  );
}
