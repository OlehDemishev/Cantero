"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUpload, downloadBlob } from "@/lib/api-client";

type CertificateAttachmentParam = "subcontractorDocumentId" | "supplierDocumentId" | "companyDocumentId";

interface DocumentSummary {
  id: string;
  name: string;
}

/** A single optional file (PDF or scanned image) attached to one insurance-document record —
 * the proof behind the tracked type/name/expiry, shared across subcontractor, supplier, and
 * company COI records via whichever Document attachment param applies. */
export function CertificateAttachment({ param, entityId }: { param: CertificateAttachmentParam; entityId: string }) {
  const t = useTranslations("common");
  const inputRef = useRef<HTMLInputElement>(null);
  const [doc, setDoc] = useState<DocumentSummary | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<DocumentSummary[]>(`/documents?${param}=${entityId}`).then((docs) => setDoc(docs[0] ?? null));
  }

  useEffect(load, [param, entityId]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      await apiUpload(`/documents?${param}=${entityId}&category=insurance_certificate`, file);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function view() {
    if (!doc) return;
    const blob = await apiFetch<Blob>(`/documents/${doc.id}/download`);
    downloadBlob(blob, doc.name);
  }

  if (doc === undefined) return null;

  return doc ? (
    <button onClick={view} className="text-brand-700 hover:underline">
      {t("viewCertificate")}
    </button>
  ) : (
    <>
      <input ref={inputRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={handleFile} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="text-gray-400 hover:text-brand-700">
        {busy ? t("uploading") : t("uploadCertificate")}
      </button>
    </>
  );
}
