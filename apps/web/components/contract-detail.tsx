"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchClientLink } from "@/lib/client-link";
import { useCan } from "@/lib/permissions";
import { goBack } from "@/lib/back-navigation";
import { formatDateTime } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/status-tone";
import { FormError } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

interface Contract {
  id: string;
  title: string;
  body: string;
  status: "draft" | "sent" | "signed" | "void";
  signerName: string | null;
  signedAt: string | null;
  client: { id: string; name: string } | null;
  subcontractor: { id: string; name: string } | null;
  docusignEnvelopeId: string | null;
  docusignStatus: string | null;
  docusignSignedPdfKey: string | null;
}


export function ContractDetail({ contractId }: { contractId: string }) {
  const t = useTranslations("contracts");
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");
  const router = useRouter();

  const [contract, setContract] = useState<Contract | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [bodyDraft, setBodyDraft] = useState("");
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const can = useCan();
  const [docusignError, setDocusignError] = useState<string | null>(null);

  function load() {
    apiFetch<Contract>(`/contracts/${contractId}`)
      .then((c) => {
        setLoadError(null);
        setContract(c);
        setBodyDraft(c.body);
        if (c.status === "signed") {
          apiFetch<Blob>(`/contracts/${contractId}/signature`)
            .then((blob) => setSignatureUrl(URL.createObjectURL(blob)))
            .catch(() => setSignatureUrl(null));
        }
      })
      .catch(setLoadError);
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

  async function sendViaDocusign() {
    setBusy(true);
    setDocusignError(null);
    try {
      await apiFetch(`/contracts/${contractId}/send-docusign`, { method: "POST" });
      load();
    } catch (err) {
      setDocusignError(err instanceof Error ? err.message : "Failed to send via DocuSign");
    } finally {
      setBusy(false);
    }
  }

  async function downloadDocusignSignedPdf() {
    const blob = await apiFetch<Blob>(`/contracts/${contractId}/docusign-signed-pdf`);
    downloadBlob(blob, `${contract?.title ?? "contract"}-docusign-signed.pdf`);
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
    await navigator.clipboard.writeText(await fetchClientLink(`/contracts/${contractId}/client-link`, "contract"));
    setLinkCopied(true);
  }

  if (!contract) {
    return loadError ? <ErrorState error={loadError} onRetry={load} backHref="/contracts" /> : <Skeleton variant="block" height="h-64" />;
  }

  return (
    <>
      <PageHeader
        back={{ onClick: () => goBack(router, "/contracts"), label: tc("back") }}
        title={contract.title}
        actions={<Badge tone={statusTone(contract.status)}>{t(contract.status)}</Badge>}
      />
      {(contract.client || contract.subcontractor) && (
        <p className="text-sm text-fg-subtle">
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
              <textarea aria-label={ta("contractText")}
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
            <div className="card whitespace-pre-wrap text-sm text-fg-muted">{contract.body}</div>
          )}

          {contract.status === "signed" && contract.signerName && (
            <div className="card mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{t("signedBy")}</p>
              <p className="mt-1 text-sm text-fg-muted">
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
            {contract.status === "draft" && contract.client && (
              <button onClick={sendViaDocusign} disabled={busy} className="btn-secondary">
                {t("sendViaDocusign")}
              </button>
            )}
            {contract.docusignStatus && (
              <p className="text-xs text-fg-subtle">{t("docusignStatusLabel", { status: contract.docusignStatus })}</p>
            )}
            {contract.docusignEnvelopeId && contract.status === "sent" && (
              <p className="text-xs text-fg-subtle">{t("docusignAutoPollHint")}</p>
            )}
            {docusignError && <FormError>{docusignError}</FormError>}
            {contract.status !== "void" && (
              <button onClick={voidContract} disabled={busy} className="btn-secondary">
                {t("voidContract")}
              </button>
            )}
            <button onClick={downloadPdf} className="btn-secondary">
              {t("downloadPdf")}
            </button>
            {contract.docusignSignedPdfKey && (
              <button onClick={downloadDocusignSignedPdf} className="btn-secondary">
                {t("downloadDocusignSignedPdf")}
              </button>
            )}
            {/* Only a contract sent by the app's own link has one — DocuSign envelopes don't. */}
            {contract.status !== "draft" && !contract.docusignEnvelopeId && can("contracts.manage") && (
              <button onClick={copyLink} className="btn-secondary">
                {linkCopied ? tc("linkCopied") : tc("copyLink")}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
