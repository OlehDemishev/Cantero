"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUpload, downloadBlob } from "@/lib/api-client";

interface Document {
  id: string;
  name: string;
  mimeType: string;
  createdAt: string;
}

export function DocumentsPanel({ projectId, invoiceId }: { projectId?: string; invoiceId?: string }) {
  const t = useTranslations("documents");
  const tc = useTranslations("common");
  const [documents, setDocuments] = useState<Document[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function query() {
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    if (invoiceId) params.set("invoiceId", invoiceId);
    return params.toString();
  }

  function load() {
    apiFetch<Document[]>(`/documents?${query()}`).then(setDocuments);
  }

  useEffect(load, [projectId, invoiceId]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await apiUpload(`/documents?${query()}`, file);
      load();
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function download(doc: Document) {
    const blob = await apiFetch<Blob>(`/documents/${doc.id}/download`);
    downloadBlob(blob, doc.name);
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("title")}</h2>
      {!documents ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noDocuments")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((doc) => (
            <li key={doc.id} className="card flex items-center justify-between">
              <span className="text-sm">{doc.name}</span>
              <button onClick={() => download(doc)} className="btn-secondary px-3 py-1 text-xs">
                {tc("download")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <input ref={fileInputRef} type="file" onChange={handleFileChange} disabled={busy} className="text-sm" />
      </div>
    </div>
  );
}
