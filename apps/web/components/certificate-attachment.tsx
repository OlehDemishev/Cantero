"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUpload, downloadBlob } from "@/lib/api-client";

interface DocumentSummary {
  id: string;
  name: string;
}

/** A single optional file (PDF or scanned image) attached to one SubcontractorDocument record — the proof behind the tracked type/name/expiry. */
export function CertificateAttachment({ subcontractorDocumentId }: { subcontractorDocumentId: string }) {
  const t = useTranslations("subcontractorCompliance");
  const inputRef = useRef<HTMLInputElement>(null);
  const [doc, setDoc] = useState<DocumentSummary | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<DocumentSummary[]>(`/documents?subcontractorDocumentId=${subcontractorDocumentId}`).then((docs) =>
      setDoc(docs[0] ?? null),
    );
  }

  useEffect(load, [subcontractorDocumentId]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      await apiUpload(`/documents?subcontractorDocumentId=${subcontractorDocumentId}&category=insurance_certificate`, file);
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
