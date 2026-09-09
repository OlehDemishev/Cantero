"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@cantero/shared";
import { apiFetch, apiUpload, downloadBlob } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format-date";

interface Document {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  category: DocumentCategory;
  tags: string[];
  version: number;
  createdAt: string;
  uploadedBy: { name: string } | null;
}

export function DocumentsPanel({
  projectId,
  invoiceId,
  insuranceClaimId,
}: {
  projectId?: string;
  invoiceId?: string;
  insuranceClaimId?: string;
}) {
  const t = useTranslations("documents");
  const tc = useTranslations("common");
  const [documents, setDocuments] = useState<Document[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<DocumentCategory>("other");
  const [newTags, setNewTags] = useState("");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [versionsFor, setVersionsFor] = useState<string | null>(null);
  const [versions, setVersions] = useState<Document[] | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparing, setComparing] = useState<{ a: Document; b: Document } | null>(null);
  const [comparePreviews, setComparePreviews] = useState<Record<string, string>>({});
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [tagsDraft, setTagsDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  function query() {
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    if (invoiceId) params.set("invoiceId", invoiceId);
    if (insuranceClaimId) params.set("insuranceClaimId", insuranceClaimId);
    return params.toString();
  }

  function load() {
    const params = new URLSearchParams(query());
    if (search) params.set("search", search);
    if (tagFilter) params.set("tag", tagFilter);
    apiFetch<Document[]>(`/documents?${params.toString()}`).then(setDocuments);
  }

  useEffect(load, [projectId, invoiceId, insuranceClaimId, search, tagFilter]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const params = new URLSearchParams(query());
      params.set("category", category);
      if (newTags.trim()) params.set("tags", newTags.trim());
      await apiUpload(`/documents?${params.toString()}`, file);
      setNewTags("");
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
      setCompareIds([]);
      return;
    }
    setVersionsFor(doc.id);
    setCompareIds([]);
    apiFetch<Document[]>(`/documents/${doc.id}/versions`).then(setVersions);
  }

  function toggleCompareId(id: string) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  async function openCompare() {
    if (!versions || compareIds.length !== 2) return;
    const a = versions.find((v) => v.id === compareIds[0])!;
    const b = versions.find((v) => v.id === compareIds[1])!;
    setComparing({ a, b });

    const pairs = await Promise.all(
      [a, b]
        .filter((d) => d.mimeType.startsWith("image/"))
        .map(async (d) => {
          const blob = await apiFetch<Blob>(`/documents/${d.id}/download`);
          return [d.id, URL.createObjectURL(blob)] as const;
        }),
    );
    setComparePreviews(Object.fromEntries(pairs));
  }

  function closeCompare() {
    Object.values(comparePreviews).forEach((url) => URL.revokeObjectURL(url));
    setComparePreviews({});
    setComparing(null);
  }

  function startEditTags(doc: Document) {
    setEditingTagsId(doc.id);
    setTagsDraft(doc.tags.join(", "));
  }

  async function saveTags(doc: Document) {
    setBusy(true);
    try {
      const tags = tagsDraft
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      await apiFetch(`/documents/${doc.id}/tags`, { method: "PATCH", body: JSON.stringify({ tags }) });
      setEditingTagsId(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input w-auto"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          className="input w-auto"
          placeholder={t("tagFilterPlaceholder")}
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
        />
      </div>

      {!documents ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noDocuments")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((doc) => (
            <li key={doc.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm">{doc.name}</span>
                  <span className="ml-2 rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-300">
                    {t(`category_${doc.category}`)}
                  </span>
                  {doc.tags.map((tag) => (
                    <span key={tag} className="ml-1 rounded-full bg-brand-50 dark:bg-brand-500/15 px-2 py-0.5 text-xs text-brand-700 dark:text-brand-400">
                      {tag}
                    </span>
                  ))}
                  {doc.version > 1 && (
                    <button
                      onClick={() => toggleVersions(doc)}
                      className="ml-2 text-xs text-brand-700 dark:text-brand-400 hover:underline"
                    >
                      {t("versionCount", { count: doc.version })}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button onClick={() => download(doc)} className="btn-secondary px-3 py-1 text-xs">
                    {tc("download")}
                  </button>
                  <button onClick={() => startEditTags(doc)} className="text-brand-700 dark:text-brand-400 hover:underline">
                    {t("editTags")}
                  </button>
                  <button onClick={() => startReplace(doc.id)} disabled={busy} className="text-brand-700 dark:text-brand-400 hover:underline">
                    {t("replace")}
                  </button>
                  <button onClick={() => remove(doc)} disabled={busy} className="text-error-700 dark:text-error-500 hover:underline">
                    {tc("delete")}
                  </button>
                </div>
              </div>
              {doc.uploadedBy && (
                <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  {t("uploadedBy", { name: doc.uploadedBy.name })}
                </div>
              )}
              {editingTagsId === doc.id && (
                <div className="mt-2 flex items-center gap-2 border-t border-gray-100 dark:border-gray-700 pt-2">
                  <input
                    className="input flex-1 text-xs"
                    placeholder={t("tagsPlaceholder")}
                    value={tagsDraft}
                    onChange={(e) => setTagsDraft(e.target.value)}
                  />
                  <button onClick={() => saveTags(doc)} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                    {tc("save")}
                  </button>
                  <button onClick={() => setEditingTagsId(null)} className="text-xs text-gray-400 dark:text-gray-500">
                    {tc("cancel")}
                  </button>
                </div>
              )}
              {versionsFor === doc.id && versions && (
                <div className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-2">
                  <ul className="flex flex-col gap-1">
                    {versions.map((v) => (
                      <li key={v.id} className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <input
                          type="checkbox"
                          checked={compareIds.includes(v.id)}
                          onChange={() => toggleCompareId(v.id)}
                        />
                        <span className="flex-1">
                          {t("version", { n: v.version })} — {formatDateTime(new Date(v.createdAt))}
                          {v.uploadedBy ? ` — ${v.uploadedBy.name}` : ""}
                        </span>
                        <button onClick={() => download(v)} className="text-brand-700 dark:text-brand-400 hover:underline">
                          {tc("download")}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={openCompare}
                    disabled={compareIds.length !== 2}
                    className="btn-secondary mt-2 px-2 py-1 text-xs disabled:opacity-40"
                  >
                    {t("compareVersions")}
                  </button>
                </div>
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
        <input
          className="input w-auto"
          placeholder={t("tagsPlaceholder")}
          value={newTags}
          onChange={(e) => setNewTags(e.target.value)}
        />
        <input ref={fileInputRef} type="file" onChange={handleFileChange} disabled={busy} className="text-sm" />
      </div>
      <input ref={replaceInputRef} type="file" onChange={handleReplaceChange} className="hidden" />

      {comparing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeCompare}>
          <div className="max-h-full max-w-4xl overflow-auto rounded-lg bg-white dark:bg-gray-800 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("compareVersions")}</h3>
              <button onClick={closeCompare} className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700">
                {tc("close")}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[comparing.a, comparing.b].map((v) => (
                <div key={v.id}>
                  <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                    {t("version", { n: v.version })} — {formatDateTime(new Date(v.createdAt))}
                  </div>
                  {comparePreviews[v.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={comparePreviews[v.id]} alt="" className="max-h-[60vh] w-full rounded border border-gray-200 dark:border-gray-700 object-contain" />
                  ) : (
                    <div className="rounded border border-gray-200 dark:border-gray-700 p-6 text-center text-xs text-gray-400 dark:text-gray-500">
                      {t("noPreview")}
                      <div className="mt-2">
                        <button onClick={() => download(v)} className="btn-secondary px-2 py-1 text-xs">
                          {tc("download")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
