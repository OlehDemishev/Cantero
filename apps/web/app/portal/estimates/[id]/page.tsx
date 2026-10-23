"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getPortalToken, portalApiFetch } from "@/lib/portal-api-client";
import { downloadBlob } from "@/lib/api-client";
import { SignaturePad } from "@/components/signature-pad";
import { formatDateTime } from "@/lib/format-date";
import { formatCurrency } from "@/lib/format-currency";
import { PublicLinkError } from "@/components/public-link-error";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Field, FormError } from "@/components/ui/field";

interface PortalLine {
  id: string;
  description: string;
  unit: string;
  quantity: string;
  lineTotal: string;
}
type ClientDecision = "pending" | "approved" | "rejected";
interface PortalEstimate {
  id: string;
  name: string;
  variantLabel: string | null;
  clientDecision: ClientDecision;
  decisionAt: string | null;
  clientDecisionNote: string | null;
  signerName: string | null;
  hasSignature: boolean;
  companyName: string;
  currency: string;
  projectName: string | null;
  lines: PortalLine[];
  subtotal: string;
  markupAmount: string;
  taxAmount: string;
  grandTotal: string;
}

export default function PortalEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("portal");
  const tp = useTranslations("publicLink");
  const te = useTranslations("estimates");
  const router = useRouter();

  const [estimate, setEstimate] = useState<PortalEstimate | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [note, setNote] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    portalApiFetch<PortalEstimate>(`/portal/estimates/${id}`)
      .then((e) => {
        setEstimate(e);
        if (e.hasSignature) {
          portalApiFetch<Blob>(`/portal/estimates/${id}/signature`)
            .then((blob) => setSignatureUrl(URL.createObjectURL(blob)))
            .catch(() => setSignatureUrl(null));
        }
      })
      .catch(setLoadError);
  }

  useEffect(() => {
    if (!getPortalToken()) {
      router.replace("/portal/login");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function decide(decision: "approved" | "rejected") {
    if (decision === "approved" && (!signerName.trim() || !signatureDataUrl)) {
      setSignatureError(te("signatureRequired"));
      return;
    }
    setSignatureError(null);
    setBusy(true);
    try {
      await portalApiFetch(`/portal/estimates/${id}/decision`, {
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

  async function downloadPdf() {
    const blob = await portalApiFetch<Blob>(`/portal/estimates/${id}/pdf`);
    downloadBlob(blob, `${estimate?.name ?? "estimate"}.pdf`);
  }

  if (loadError) {
    return (
      <PublicLinkError
        error={loadError}
        action={
          <a href="/portal" className="btn-primary inline-block">
            {tp("backToPortal")}
          </a>
        }
      />
    );
  }
  if (!estimate) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
        <p className="text-sm text-fg-subtle">{t("loading")}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
      <div className="w-full max-w-2xl">
        <a href="/portal" className="mb-4 inline-block text-xs text-fg-subtle hover:underline">
          ← {estimate.companyName}
        </a>
        <div className="card">
          <h1 className="text-xl font-semibold text-fg">
            {estimate.name}
            {estimate.variantLabel && (
              <Badge tone="brand" className="ml-2 align-middle">
                {estimate.variantLabel}
              </Badge>
            )}
          </h1>
          {estimate.projectName && <p className="mt-1 text-sm text-fg-subtle">{estimate.projectName}</p>}

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                  <th className="py-2">{te("rateItem")}</th>
                  <th>{te("quantity")}</th>
                  <th className="text-right">{te("lineTotal")}</th>
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
              <dt className="text-fg-subtle">{te("subtotal")}</dt>
              <dd>
                {formatCurrency(estimate.subtotal, estimate.currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-subtle">{te("markupAmount")}</dt>
              <dd>
                {formatCurrency(estimate.markupAmount, estimate.currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-subtle">{te("taxAmount")}</dt>
              <dd>
                {formatCurrency(estimate.taxAmount, estimate.currency)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2 font-semibold">
              <dt>{te("grandTotal")}</dt>
              <dd>
                {formatCurrency(estimate.grandTotal, estimate.currency)}
              </dd>
            </div>
          </dl>

          {estimate.clientDecision === "pending" ? (
            <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-4">
              <Field label={te("clientNoteOptional")}>
                <textarea rows={2} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>

              <div className="mt-4 flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-fg-muted">{te("signerNameLabel")}</span>
                <input
                  className="input"
                  placeholder={te("signerNamePlaceholder")}
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                />
              </div>
              <div className="mt-3 flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-fg-muted">{te("signHere")}</span>
                <SignaturePad onChange={setSignatureDataUrl} clearLabel={te("clearSignature")} />
              </div>
              {signatureError && <FormError className="mt-2">{signatureError}</FormError>}

              <div className="mt-3 flex gap-2">
                <button onClick={() => decide("approved")} disabled={busy} className="btn-primary flex-1">
                  {te("clientApprove")}
                </button>
                <button onClick={() => decide("rejected")} disabled={busy} className="btn-secondary flex-1">
                  {te("clientReject")}
                </button>
              </div>
            </div>
          ) : (
            <Alert tone={estimate.clientDecision === "approved" ? "success" : "danger"} className="mt-6" role="status">
              {estimate.clientDecision === "approved" ? te("clientDecisionThanksApproved") : te("clientDecisionThanksRejected")}
              {estimate.decisionAt && (
                <span className="block text-xs opacity-75">{formatDateTime(new Date(estimate.decisionAt))}</span>
              )}
              {estimate.signerName && (
                <div className="mt-2 flex items-center gap-2">
                  {signatureUrl && <img src={signatureUrl} alt={te("signature")} className="h-8 rounded border border-white/50 bg-white dark:bg-gray-800 px-1" />}
                  <span className="text-xs opacity-75">{te("signedBy", { name: estimate.signerName })}</span>
                </div>
              )}
            </Alert>
          )}

          <button onClick={downloadPdf} className="btn-secondary mt-4">
            {te("downloadPdf")}
          </button>
        </div>
      </div>
    </main>
  );
}
