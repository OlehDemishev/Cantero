"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getPortalToken, portalApiFetch } from "@/lib/portal-api-client";
import { ApiError, downloadBlob } from "@/lib/api-client";
import { SignaturePad } from "@/components/signature-pad";

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
  const te = useTranslations("estimates");
  const router = useRouter();

  const [estimate, setEstimate] = useState<PortalEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
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
          portalApiFetch<Blob>(`/portal/estimates/${id}/signature`).then((blob) => setSignatureUrl(URL.createObjectURL(blob)));
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : te("linkNotFound")));
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

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
        <p className="text-sm text-gray-500">{error}</p>
      </main>
    );
  }
  if (!estimate) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
        <p className="text-sm text-gray-500">{t("loading")}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen justify-center bg-gray-50 px-6 py-12">
      <div className="w-full max-w-2xl">
        <a href="/portal" className="mb-4 inline-block text-xs text-gray-500 hover:underline">
          ← {estimate.companyName}
        </a>
        <div className="card">
          <h1 className="text-xl font-semibold text-gray-900">
            {estimate.name}
            {estimate.variantLabel && (
              <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 align-middle">
                {estimate.variantLabel}
              </span>
            )}
          </h1>
          {estimate.projectName && <p className="mt-1 text-sm text-gray-500">{estimate.projectName}</p>}

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">{te("rateItem")}</th>
                  <th>{te("quantity")}</th>
                  <th className="text-right">{te("lineTotal")}</th>
                </tr>
              </thead>
              <tbody>
                {estimate.lines.map((l) => (
                  <tr key={l.id} className="border-b border-gray-100">
                    <td className="py-2">{l.description}</td>
                    <td>
                      {l.quantity} {l.unit}
                    </td>
                    <td className="text-right">
                      {l.lineTotal} {estimate.currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="mt-4 flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">{te("subtotal")}</dt>
              <dd>
                {estimate.subtotal} {estimate.currency}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{te("markupAmount")}</dt>
              <dd>
                {estimate.markupAmount} {estimate.currency}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{te("taxAmount")}</dt>
              <dd>
                {estimate.taxAmount} {estimate.currency}
              </dd>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
              <dt>{te("grandTotal")}</dt>
              <dd>
                {estimate.grandTotal} {estimate.currency}
              </dd>
            </div>
          </dl>

          {estimate.clientDecision === "pending" ? (
            <div className="mt-6 border-t border-gray-100 pt-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700">{te("clientNoteOptional")}</span>
                <textarea rows={2} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
              </label>

              <div className="mt-4 flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700">{te("signerNameLabel")}</span>
                <input
                  className="input"
                  placeholder={te("signerNamePlaceholder")}
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                />
              </div>
              <div className="mt-3 flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700">{te("signHere")}</span>
                <SignaturePad onChange={setSignatureDataUrl} clearLabel={te("clearSignature")} />
              </div>
              {signatureError && <p className="mt-2 text-xs text-error-600">{signatureError}</p>}

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
            <div
              className={`mt-6 rounded-lg border-t px-4 py-3 text-sm ${
                estimate.clientDecision === "approved"
                  ? "border-success-200 bg-success-50 text-success-700"
                  : "border-error-200 bg-error-50 text-error-700"
              }`}
            >
              {estimate.clientDecision === "approved" ? te("clientDecisionThanksApproved") : te("clientDecisionThanksRejected")}
              {estimate.decisionAt && (
                <span className="block text-xs opacity-75">{new Date(estimate.decisionAt).toLocaleString()}</span>
              )}
              {estimate.signerName && (
                <div className="mt-2 flex items-center gap-2">
                  {signatureUrl && <img src={signatureUrl} alt={te("signature")} className="h-8 rounded border border-white/50 bg-white px-1" />}
                  <span className="text-xs opacity-75">{te("signedBy", { name: estimate.signerName })}</span>
                </div>
              )}
            </div>
          )}

          <button onClick={downloadPdf} className="btn-secondary mt-4">
            {te("downloadPdf")}
          </button>
        </div>
      </div>
    </main>
  );
}
