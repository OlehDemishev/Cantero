"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@cantero/shared";
import { apiFetch, apiUpload, downloadBlob, notifyApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format-date";
import { Dialog } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/use-api";
import { Badge } from "@/components/ui/badge";

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
  const confirm = useConfirm();
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");
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

  const listParams = new URLSearchParams(query());
  if (search) listParams.set("search", search);
  if (tagFilter) listParams.set("tag", tagFilter);
  const {
    data: documents = null,
    error: documentsError,
    reload: reloadDocuments,
  } = useApi<Document[]>(`/documents?${listParams.toString()}`, { keepPrevious: query() });

  function load() {
    void reloadDocuments();
  }

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
    if (!(await confirm({ message: t("confirmDelete"), tone: "danger", verb: "delete" }))) return;
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
    apiFetch<Document[]>(`/documents/${doc.id}/versions`).then(setVersions).catch(notifyApiError);
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
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("title")}</h2>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input w-auto"
          placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          className="input w-auto"
          placeholder={t("tagFilterPlaceholder")} aria-label={t("tagFilterPlaceholder")}
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
        />
      </div>

      {!documents ? (
        documentsError ? <ErrorState error={documentsError} onRetry={reloadDocuments} compact /> : <Skeleton lines={3} />
      ) : documents.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noDocuments")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((doc) => (
            <li key={doc.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm">{doc.name}</span>
                  <Badge tone="neutral" className="ml-2">
                    {t(`category_${doc.category}`)}
                  </Badge>
                  {doc.tags.map((tag) => (
                    <Badge tone="brand" className="ml-1" key={tag}>
                      {tag}
                    </Badge>
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
                  <button onClick={() => remove(doc)} disabled={busy} className="text-danger-fg hover:underline">
                    {tc("delete")}
                  </button>
                </div>
              </div>
              {doc.uploadedBy && (
                <div className="mt-1 text-xs text-fg-subtle">
                  {t("uploadedBy", { name: doc.uploadedBy.name })}
                </div>
              )}
              {editingTagsId === doc.id && (
                <div className="mt-2 flex items-center gap-2 border-t border-gray-100 dark:border-gray-700 pt-2">
                  <input
                    className="input flex-1 text-xs"
                    placeholder={t("tagsPlaceholder")} aria-label={t("tagsPlaceholder")}
                    value={tagsDraft}
                    onChange={(e) => setTagsDraft(e.target.value)}
                  />
                  <button onClick={() => saveTags(doc)} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                    {tc("save")}
                  </button>
                  <button onClick={() => setEditingTagsId(null)} className="text-xs text-fg-subtle">
                    {tc("cancel")}
                  </button>
                </div>
              )}
              {versionsFor === doc.id && versions && (
                <div className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-2">
                  <ul className="flex flex-col gap-1">
                    {versions.map((v) => (
                      <li key={v.id} className="flex items-center gap-2 text-xs text-fg-subtle">
                        <input aria-label={ta("fieldOf", { field: ta("compare"), item: t("version", { n: v.version }) })}
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
        <select aria-label={t("category")}
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
          placeholder={t("tagsPlaceholder")} aria-label={t("tagsPlaceholder")}
          value={newTags}
          onChange={(e) => setNewTags(e.target.value)}
        />
        <input ref={fileInputRef} type="file" onChange={handleFileChange} className="hidden" />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy} className="btn-secondary">
          {t("chooseFile")}
        </button>
      </div>
      <input ref={replaceInputRef} type="file" onChange={handleReplaceChange} className="hidden" />

      <Dialog
        open={!!comparing}
        onClose={closeCompare}
        title={t("compareVersions")}
        showCloseButton
        panelClassName="max-w-4xl p-4"
      >
        {comparing && (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[comparing.a, comparing.b].map((v) => (
              <div key={v.id}>
                <div className="mb-2 text-xs font-medium text-fg-muted">
                  {t("version", { n: v.version })} — {formatDateTime(new Date(v.createdAt))}
                </div>
                {comparePreviews[v.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={comparePreviews[v.id]}
                    alt={t("version", { n: v.version })}
                    className="max-h-[60vh] w-full rounded border border-border object-contain"
                  />
                ) : (
                  <div className="rounded border border-border p-6 text-center text-xs text-fg-subtle">
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
        )}
      </Dialog>
    </div>
  );
}
