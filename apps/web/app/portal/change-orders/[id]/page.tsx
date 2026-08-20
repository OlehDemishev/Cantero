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
interface PortalChangeOrder {
  id: string;
  number: number;
  title: string;
  description: string | null;
  clientDecision: ClientDecision;
  decisionAt: string | null;
  clientDecisionNote: string | null;
  signerName: string | null;
  hasSignature: boolean;
  companyName: string;
  currency: string;
  estimateName: string;
  lines: PortalLine[];
  subtotal: string;
  markupAmount: string;
  taxAmount: string;
  grandTotal: string;
}

export default function PortalChangeOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("portal");
  const te = useTranslations("estimates");
  const router = useRouter();

  const [co, setCo] = useState<PortalChangeOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    portalApiFetch<PortalChangeOrder>(`/portal/change-orders/${id}`)
      .then((c) => {
        setCo(c);
        if (c.hasSignature) {
          portalApiFetch<Blob>(`/portal/change-orders/${id}/signature`).then((blob) => setSignatureUrl(URL.createObjectURL(blob)));
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
      await portalApiFetch(`/portal/change-orders/${id}/decision`, {
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
    const blob = await portalApiFetch<Blob>(`/portal/change-orders/${id}/pdf`);
    downloadBlob(blob, `CO-${co?.number ?? ""}.pdf`);
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
        <p className="text-sm text-gray-500">{error}</p>
      </main>
    );
  }
  if (!co) {
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
          ← {co.companyName}
        </a>
        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {te("changeOrderFor", { estimateName: co.estimateName })}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-gray-900">
            CO-{co.number} — {co.title}
          </h1>
          {co.description && <p className="mt-1 text-sm text-gray-500">{co.description}</p>}

          <table className="mt-6 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2">{te("rateItem")}</th>
                <th>{te("quantity")}</th>
                <th className="text-right">{te("lineTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {co.lines.map((l) => (
                <tr key={l.id} className="border-b border-gray-100">
                  <td className="py-2">{l.description}</td>
                  <td>
                    {l.quantity} {l.unit}
                  </td>
                  <td className="text-right">
                    {l.lineTotal} {co.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="mt-4 flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">{te("subtotal")}</dt>
              <dd>
                {co.subtotal} {co.currency}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{te("markupAmount")}</dt>
              <dd>
                {co.markupAmount} {co.currency}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{te("taxAmount")}</dt>
              <dd>
                {co.taxAmount} {co.currency}
              </dd>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
              <dt>{te("grandTotal")}</dt>
              <dd>
                {co.grandTotal} {co.currency}
              </dd>
            </div>
          </dl>

          {co.clientDecision === "pending" ? (
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
                co.clientDecision === "approved"
                  ? "border-success-200 bg-success-50 text-success-700"
                  : "border-error-200 bg-error-50 text-error-700"
              }`}
            >
              {co.clientDecision === "approved" ? te("clientDecisionThanksApproved") : te("clientDecisionThanksRejected")}
              {co.decisionAt && <span className="block text-xs opacity-75">{new Date(co.decisionAt).toLocaleString()}</span>}
              {co.signerName && (
                <div className="mt-2 flex items-center gap-2">
                  {signatureUrl && <img src={signatureUrl} alt={te("signature")} className="h-8 rounded border border-white/50 bg-white px-1" />}
                  <span className="text-xs opacity-75">{te("signedBy", { name: co.signerName })}</span>
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
