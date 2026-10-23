"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@cantero/shared";
import { apiFetch, apiUpload, downloadBlob } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SignatureRequestsPanel } from "@/components/signature-requests-panel";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatNumber } from "@/lib/format-currency";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";

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
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, { fractionDigits: 1 })} KB`;
  return `${formatNumber(bytes / 1024 / 1024, { fractionDigits: 1 })} MB`;
}

export default function DocumentsPage() {
  const t = useTranslations("documents");
  const confirm = useConfirm();
  const tc = useTranslations("common");

  const { data: projects = [] } = useApi<Project[]>("/projects");
  const [category, setCategory] = useState<DocumentCategory | "">("");
  const [search, setSearch] = useState("");
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>("other");
  const [uploadProjectId, setUploadProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (search) params.set("search", search);
  const { data: documents = null, reload: reloadDocuments, error: documentsError } = useApi<Document[]>(`/documents?${params.toString()}`, { keepPrevious: true });

  function load() {
    void reloadDocuments();
  }

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
    if (!(await confirm({ message: t("confirmDelete"), tone: "danger", verb: "delete" }))) return;
    setBusy(true);
    try {
      await apiFetch(`/documents/${doc.id}`, { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={t("title")} />

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
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
        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
          {tc("name")}
          <input className="input mt-1" placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      <div className="mt-8 overflow-x-auto">
        {!documents ? (
          documentsError ? <ErrorState error={documentsError} onRetry={reloadDocuments} compact /> : <Skeleton lines={3} />
        ) : documents.length === 0 ? (
          <p className="text-sm text-fg-subtle">{t("noDocuments")}</p>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
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
                <tr key={doc.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">
                    {doc.name}
                    {doc.version > 1 && (
                      <span className="ml-2 text-xs text-fg-subtle">{t("version", { n: doc.version })}</span>
                    )}
                  </td>
                  <td>
                    <Badge tone="neutral">
                      {t(`category_${doc.category}`)}
                    </Badge>
                  </td>
                  <td>
                    {doc.projectId ? (
                      <a href={`/projects/${doc.projectId}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                        {doc.project?.name ?? "—"}
                      </a>
                    ) : doc.invoiceId ? (
                      <a href={`/invoices/${doc.invoiceId}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                        {t("invoiceLink")}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-fg-subtle">{doc.uploadedBy?.name ?? "—"}</td>
                  <td className="text-right text-fg-subtle">{formatSize(doc.size)}</td>
                  <td className="text-right text-xs">
                    <button onClick={() => download(doc)} className="text-brand-700 dark:text-brand-400 hover:underline">
                      {tc("download")}
                    </button>
                    <button onClick={() => remove(doc)} disabled={busy} className="ml-3 text-danger-fg hover:underline">
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
        <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("uploadNew")}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
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
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
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
          <input ref={fileInputRef} type="file" onChange={handleFileChange} className="hidden" />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy} className="btn-secondary">
            {t("chooseFile")}
          </button>
        </div>
      </div>

      <SignatureRequestsPanel documents={documents ?? []} />
    </>
  );
}
