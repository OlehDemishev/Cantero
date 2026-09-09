"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api-client";
import { SignaturePad } from "@/components/signature-pad";
import { formatDateTime } from "@/lib/format-date";

type ContractStatus = "draft" | "sent" | "signed" | "void";
interface PublicContract {
  id: string;
  title: string;
  body: string;
  status: ContractStatus;
  companyName: string;
  projectName: string;
  signerName: string | null;
  signedAt: string | null;
}

export default function PublicContractPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useTranslations("contracts");
  const tc = useTranslations("common");

  const [contract, setContract] = useState<PublicContract | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<PublicContract>(`/public/contracts/${token}`)
      .then(setContract)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("linkNotFound")));
  }

  useEffect(load, [token]);

  async function sign() {
    if (!signerName.trim() || !signatureDataUrl) {
      setSignatureError(t("signatureRequired"));
      return;
    }
    setSignatureError(null);
    setBusy(true);
    try {
      await apiFetch(`/public/contracts/${token}/sign`, {
        method: "POST",
        body: JSON.stringify({ signerName: signerName.trim(), signatureDataUrl }),
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

  if (!contract) {
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
          <span className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-50">{contract.companyName}</span>
        </div>

        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">{contract.projectName}</p>
          <h1 className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-50">{contract.title}</h1>
          <div className="mt-4 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">{contract.body}</div>

          {contract.status === "sent" ? (
            <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-4">
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-200">{t("signerNameLabel")}</span>
                <input className="input" placeholder={t("signerNamePlaceholder")} value={signerName} onChange={(e) => setSignerName(e.target.value)} />
              </div>
              <div className="mt-3 flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-200">{t("signHere")}</span>
                <SignaturePad onChange={setSignatureDataUrl} clearLabel={t("clearSignature")} />
              </div>
              {signatureError && <p className="mt-2 text-xs text-error-600">{signatureError}</p>}
              <button onClick={sign} disabled={busy} className="btn-primary mt-3 w-full">
                {t("clientSign")}
              </button>
            </div>
          ) : contract.status === "signed" ? (
            <div className="mt-6 rounded-lg border-t border-success-200 bg-success-50 dark:bg-success-500/15 px-4 py-3 text-sm text-success-700 dark:text-success-500">
              {t("signedThanks")}
              {contract.signedAt && <span className="block text-xs opacity-75">{formatDateTime(new Date(contract.signedAt))}</span>}
            </div>
          ) : (
            <div className="mt-6 rounded-lg border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{t("notAwaitingSignature")}</div>
          )}
        </div>
      </div>
    </main>
  );
}
