"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@cantero/shared";
import { apiFetch, apiUpload, downloadBlob } from "@/lib/api-client";

interface Project {
  id: string;
  name: string;
}
interface Document {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  category: DocumentCategory;
  version: number;
  createdAt: string;
  projectId: string | null;
  invoiceId: string | null;
  project: { name: string } | null;
  uploadedBy: { name: string } | null;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const t = useTranslations("documents");
  const tc = useTranslations("common");

  const [documents, setDocuments] = useState<Document[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [category, setCategory] = useState<DocumentCategory | "">("");
  const [search, setSearch] = useState("");
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>("other");
  const [uploadProjectId, setUploadProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (search) params.set("search", search);
    apiFetch<Document[]>(`/documents?${params.toString()}`).then(setDocuments);
  }

  useEffect(load, [category, search]);
  useEffect(() => {
    apiFetch<Project[]>("/projects").then(setProjects);
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({ category: uploadCategory });
      if (uploadProjectId) params.set("projectId", uploadProjectId);
      await apiUpload(`/documents?${params.toString()}`, file);
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

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-500">
          {t("category")}
          <select
            className="input mt-1 w-auto"
            value={category}
            onChange={(e) => setCategory(e.target.value as DocumentCategory | "")}
          >
            <option value="">{t("allCategories")}</option>
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`category_${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          {tc("name")}
          <input className="input mt-1" placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      <div className="mt-8 overflow-x-auto">
        {!documents ? (
          <p className="text-gray-500">{tc("loading")}</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-gray-400">{t("noDocuments")}</p>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2">{tc("name")}</th>
                <th>{t("category")}</th>
                <th>{t("project")}</th>
                <th>{t("uploadedByLabel")}</th>
                <th className="text-right">{t("size")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-b border-gray-100">
                  <td className="py-2">
                    {doc.name}
                    {doc.version > 1 && (
                      <span className="ml-2 text-xs text-gray-400">{t("version", { n: doc.version })}</span>
                    )}
                  </td>
                  <td>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {t(`category_${doc.category}`)}
                    </span>
                  </td>
                  <td>
                    {doc.projectId ? (
                      <a href={`/projects/${doc.projectId}`} className="text-brand-700 hover:underline">
                        {doc.project?.name ?? "—"}
                      </a>
                    ) : doc.invoiceId ? (
                      <a href={`/invoices/${doc.invoiceId}`} className="text-brand-700 hover:underline">
                        {t("invoiceLink")}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-gray-500">{doc.uploadedBy?.name ?? "—"}</td>
                  <td className="text-right text-gray-500">{formatSize(doc.size)}</td>
                  <td className="text-right text-xs">
                    <button onClick={() => download(doc)} className="text-brand-700 hover:underline">
                      {tc("download")}
                    </button>
                    <button onClick={() => remove(doc)} disabled={busy} className="ml-3 text-error-700 hover:underline">
                      {tc("delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card mt-8">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("uploadNew")}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-gray-500">
            {t("category")}
            <select
              className="input mt-1 w-auto"
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value as DocumentCategory)}
            >
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`category_${c}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-500">
            {t("project")}
            <select className="input mt-1 w-auto" value={uploadProjectId} onChange={(e) => setUploadProjectId(e.target.value)}>
              <option value="">{t("noProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <input ref={fileInputRef} type="file" onChange={handleFileChange} disabled={busy} className="text-sm" />
        </div>
      </div>
    </AuthenticatedShell>
  );
}
