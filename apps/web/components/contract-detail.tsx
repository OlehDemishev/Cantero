"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { goBack } from "@/lib/back-navigation";
import { formatDateTime } from "@/lib/format-date";

interface Contract {
  id: string;
  title: string;
  body: string;
  status: "draft" | "sent" | "signed" | "void";
  signerName: string | null;
  signedAt: string | null;
  clientAccessToken: string | null;
  client: { id: string; name: string } | null;
  subcontractor: { id: string; name: string } | null;
}

const STATUS_STYLES: Record<Contract["status"], string> = {
  draft: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
  sent: "bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-400",
  signed: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
  void: "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500",
};

export function ContractDetail({ contractId }: { contractId: string }) {
  const t = useTranslations("contracts");
  const tc = useTranslations("common");
  const router = useRouter();

  const [contract, setContract] = useState<Contract | null>(null);
  const [bodyDraft, setBodyDraft] = useState("");
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  function load() {
    apiFetch<Contract>(`/contracts/${contractId}`).then((c) => {
      setContract(c);
      setBodyDraft(c.body);
      if (c.status === "signed") {
        apiFetch<Blob>(`/contracts/${contractId}/signature`)
          .then((blob) => setSignatureUrl(URL.createObjectURL(blob)))
          .catch(() => setSignatureUrl(null));
      }
    });
  }

  useEffect(load, [contractId]);

  async function saveBody() {
    setBusy(true);
    try {
      await apiFetch(`/contracts/${contractId}/body`, { method: "POST", body: JSON.stringify({ body: bodyDraft }) });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    try {
      await apiFetch(`/contracts/${contractId}/send`, { method: "POST" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function voidContract() {
    setBusy(true);
    try {
      await apiFetch(`/contracts/${contractId}/void`, { method: "POST" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    const blob = await apiFetch<Blob>(`/contracts/${contractId}/pdf`);
    downloadBlob(blob, `${contract?.title ?? "contract"}.pdf`);
  }

  async function copyLink() {
    if (!contract?.clientAccessToken) return;
    await navigator.clipboard.writeText(`${window.location.origin}/contract/${contract.clientAccessToken}`);
    setLinkCopied(true);
  }

  if (!contract) {
    return (
      <AuthenticatedShell>
        <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      </AuthenticatedShell>
    );
  }

  return (
    <AuthenticatedShell>
      <button onClick={() => goBack(router, "/contracts")} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
        ← {tc("back")}
      </button>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{contract.title}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[contract.status]}`}>{t(contract.status)}</span>
      </div>
      {(contract.client || contract.subcontractor) && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {contract.client ? (
            <Link href={`/clients/${contract.client.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
              {contract.client.name}
            </Link>
          ) : (
            contract.subcontractor?.name
          )}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {contract.status === "draft" ? (
            <>
              <textarea
                rows={16}
                className="input w-full font-mono text-xs"
                value={bodyDraft}
                onChange={(e) => setBodyDraft(e.target.value)}
              />
              <button onClick={saveBody} disabled={busy || bodyDraft === contract.body} className="btn-secondary mt-2">
                {tc("save")}
              </button>
            </>
          ) : (
            <div className="card whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{contract.body}</div>
          )}

          {contract.status === "signed" && contract.signerName && (
            <div className="card mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">{t("signedBy")}</p>
              <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                {contract.signerName} · {contract.signedAt && formatDateTime(new Date(contract.signedAt))}
              </p>
              {signatureUrl && (
                <img src={signatureUrl} alt={t("signedBy")} className="mt-2 h-20 rounded border border-gray-200 bg-white dark:border-gray-800" />
              )}
            </div>
          )}
        </div>

        <div className="card h-fit lg:col-span-1">
          <div className="flex flex-col gap-2">
            {contract.status === "draft" && (
              <button onClick={send} disabled={busy} className="btn-primary">
                {t("send")}
              </button>
            )}
            {contract.status !== "void" && (
              <button onClick={voidContract} disabled={busy} className="btn-secondary">
                {t("voidContract")}
              </button>
            )}
            <button onClick={downloadPdf} className="btn-secondary">
              {t("downloadPdf")}
            </button>
            {contract.clientAccessToken && (
              <button onClick={copyLink} className="btn-secondary">
                {linkCopied ? tc("linkCopied") : tc("copyLink")}
              </button>
            )}
          </div>
        </div>
      </div>
    </AuthenticatedShell>
  );
}
