"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { PublicLinkError } from "@/components/public-link-error";
import { useCompanyLocale } from "@/components/public-locale";
import { SignaturePad } from "@/components/signature-pad";
import { formatDateTime } from "@/lib/format-date";
import { Alert } from "@/components/ui/alert";
import { Field, FormError } from "@/components/ui/field";

type ContractStatus = "draft" | "sent" | "signed" | "void";
interface PublicContract {
  /** The client's or company's language — see useCompanyLocale. */
  locale: string;
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
  const [error, setError] = useState<unknown>(null);
  useCompanyLocale(contract?.locale);
  const [signerName, setSignerName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<PublicContract>(`/public/contracts/${token}`)
      .then(setContract)
      .catch(setError);
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

  if (error) return <PublicLinkError error={error} />;

  if (!contract) {
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
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">C</span>
          <span className="text-lg font-semibold tracking-tight text-fg">{contract.companyName}</span>
        </div>

        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{contract.projectName}</p>
          <h1 className="mt-1 text-xl font-semibold text-fg">{contract.title}</h1>
          <div className="mt-4 whitespace-pre-wrap text-sm text-fg-muted">{contract.body}</div>

          {contract.status === "sent" ? (
            <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-4">
              <Field label={t("signerNameLabel")}>
                <input className="input" placeholder={t("signerNamePlaceholder")} value={signerName} onChange={(e) => setSignerName(e.target.value)} />
              </Field>
              <div className="mt-3 flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-fg-muted">{t("signHere")}</span>
                <SignaturePad onChange={setSignatureDataUrl} clearLabel={t("clearSignature")} />
              </div>
              {signatureError && <FormError className="mt-2">{signatureError}</FormError>}
              <button onClick={sign} disabled={busy} className="btn-primary mt-3 w-full">
                {t("clientSign")}
              </button>
            </div>
          ) : contract.status === "signed" ? (
            <Alert tone="success" className="mt-6">
              {t("signedThanks")}
              {contract.signedAt && <span className="block text-xs opacity-75">{formatDateTime(new Date(contract.signedAt))}</span>}
            </Alert>
          ) : (
            <div className="mt-6 rounded-lg border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{t("notAwaitingSignature")}</div>
          )}
        </div>
      </div>
    </main>
  );
}
