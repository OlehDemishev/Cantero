"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api-client";
import { SignaturePad } from "@/components/signature-pad";
import { formatDate } from "@/lib/format-date";

type SignatureRequestStatus = "draft" | "sent" | "completed" | "voided";
interface PublicSignatureRequest {
  title: string;
  documentName: string;
  companyName: string;
  status: SignatureRequestStatus;
  signerName: string;
  signedAt: string | null;
  isYourTurn: boolean;
  signers: { name: string; order: number; signedAt: string | null }[];
}

export default function PublicSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useTranslations("signatureRequests");
  const tc = useTranslations("common");

  const [request, setRequest] = useState<PublicSignatureRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<PublicSignatureRequest>(`/public/signature-requests/${token}`)
      .then(setRequest)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("linkNotFound")));
  }

  useEffect(load, [token]);

  async function viewDocument() {
    const blob = await apiFetch<Blob>(`/public/signature-requests/${token}/document`);
    window.open(URL.createObjectURL(blob), "_blank");
  }

  async function sign() {
    if (!signatureDataUrl) {
      setSignatureError(t("signatureRequired"));
      return;
    }
    setSignatureError(null);
    setBusy(true);
    try {
      await apiFetch(`/public/signature-requests/${token}/sign`, {
        method: "POST",
        body: JSON.stringify({ signatureDataUrl }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
        <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
      </main>
    );
  }

  if (!request) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
        <p className="text-sm text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">C</span>
          <span className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-50">{request.companyName}</span>
        </div>

        <div className="card">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">{request.title}</h1>
          <button onClick={viewDocument} className="btn-secondary mt-3 px-3 py-1 text-xs">
            {t("viewDocument", { name: request.documentName })}
          </button>

          <ul className="mt-4 flex flex-col gap-1 border-t border-gray-100 dark:border-gray-700 pt-3 text-xs text-gray-500 dark:text-gray-400">
            {request.signers
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((s) => (
                <li key={s.order} className="flex items-center gap-2">
                  <span>{s.order}.</span>
                  <span>{s.name}</span>
                  {s.signedAt ? (
                    <span className="text-success-700 dark:text-success-500">{t("signedOn", { date: formatDate(new Date(s.signedAt)) })}</span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">{t("notSigned")}</span>
                  )}
                </li>
              ))}
          </ul>

          {request.signedAt ? (
            <div className="mt-6 rounded-lg border-t border-success-200 bg-success-50 dark:bg-success-500/15 px-4 py-3 text-sm text-success-700 dark:text-success-500">
              {t("signedThanks")}
            </div>
          ) : request.status !== "sent" ? (
            <div className="mt-6 rounded-lg border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{t("notAwaitingSignature")}</div>
          ) : !request.isYourTurn ? (
            <div className="mt-6 rounded-lg border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{t("waitingOnEarlierSigner")}</div>
          ) : (
            <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-4">
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-200">{t("signHere")}</span>
                <SignaturePad onChange={setSignatureDataUrl} clearLabel={t("clearSignature")} />
              </div>
              {signatureError && <p className="mt-2 text-xs text-error-600">{signatureError}</p>}
              <button onClick={sign} disabled={busy} className="btn-primary mt-3 w-full">
                {t("submitSignature")}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
