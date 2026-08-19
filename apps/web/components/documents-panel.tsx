"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@cantero/shared";
import { apiFetch, apiUpload, downloadBlob } from "@/lib/api-client";

interface Document {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  category: DocumentCategory;
  version: number;
  createdAt: string;
  uploadedBy: { name: string } | null;
}

export function DocumentsPanel({ projectId, invoiceId }: { projectId?: string; invoiceId?: string }) {
  const t = useTranslations("documents");
  const tc = useTranslations("common");
  const [documents, setDocuments] = useState<Document[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<DocumentCategory>("other");
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [versionsFor, setVersionsFor] = useState<string | null>(null);
  const [versions, setVersions] = useState<Document[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

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
      await apiUpload(`/documents?${query()}&category=${category}`, file);
      load();
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function startReplace(id: string) {
    setReplacingId(id);
    replaceInputRef.current?.click();
  }

  async function handleReplaceChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !replacingId) return;
    setBusy(true);
    try {
      await apiUpload(`/documents/${replacingId}/replace`, file);
      load();
    } finally {
      setBusy(false);
      setReplacingId(null);
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  }

  async function download(doc: Document) {
    const blob = await apiFetch<Blob>(`/documents/${doc.id}/download`);
    downloadBlob(blob, doc.name);
  }

  async function remove(doc: Document) {
    if (!window.confirm(t("confirmDelete"))) return;
    setBusy(true);
    try {
      await apiFetch(`/documents/${doc.id}`, { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleVersions(doc: Document) {
    if (versionsFor === doc.id) {
      setVersionsFor(null);
      setVersions(null);
      return;
    }
    setVersionsFor(doc.id);
    apiFetch<Document[]>(`/documents/${doc.id}/versions`).then(setVersions);
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
            <li key={doc.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm">{doc.name}</span>
                  <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {t(`category_${doc.category}`)}
                  </span>
                  {doc.version > 1 && (
                    <button
                      onClick={() => toggleVersions(doc)}
                      className="ml-2 text-xs text-brand-700 hover:underline"
                    >
                      {t("versionCount", { count: doc.version })}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button onClick={() => download(doc)} className="btn-secondary px-3 py-1 text-xs">
                    {tc("download")}
                  </button>
                  <button onClick={() => startReplace(doc.id)} disabled={busy} className="text-brand-700 hover:underline">
                    {t("replace")}
                  </button>
                  <button onClick={() => remove(doc)} disabled={busy} className="text-error-700 hover:underline">
                    {tc("delete")}
                  </button>
                </div>
              </div>
              {doc.uploadedBy && (
                <div className="mt-1 text-xs text-gray-400">
                  {t("uploadedBy", { name: doc.uploadedBy.name })}
                </div>
              )}
              {versionsFor === doc.id && versions && (
                <ul className="mt-2 flex flex-col gap-1 border-t border-gray-100 pt-2">
                  {versions.map((v) => (
                    <li key={v.id} className="flex items-center justify-between text-xs text-gray-500">
                      <span>
                        {t("version", { n: v.version })} — {new Date(v.createdAt).toLocaleString()}
                        {v.uploadedBy ? ` — ${v.uploadedBy.name}` : ""}
                      </span>
                      <button onClick={() => download(v)} className="text-brand-700 hover:underline">
                        {tc("download")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          className="input w-auto"
          value={category}
          onChange={(e) => setCategory(e.target.value as DocumentCategory)}
        >
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`category_${c}`)}
            </option>
          ))}
        </select>
        <input ref={fileInputRef} type="file" onChange={handleFileChange} disabled={busy} className="text-sm" />
      </div>
      <input ref={replaceInputRef} type="file" onChange={handleReplaceChange} className="hidden" />
    </div>
  );
}
