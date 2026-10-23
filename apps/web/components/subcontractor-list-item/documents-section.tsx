"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CertificateAttachment } from "@/components/certificate-attachment";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import { useApi } from "@/lib/use-api";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useReloadOnVersion } from "./use-reload-on-version";
import { DOCUMENT_TYPES, type SubcontractorDocument, type SubcontractorSectionProps } from "./types";
import type { SubcontractorDocumentType } from "@cantero/shared";

/** The subcontractor's compliance documents: list, attach a certificate, add, remove. */
export function DocumentsSection({ subcontractor: s, busy, setBusy, version, refresh }: SubcontractorSectionProps) {
  const t = useTranslations("subcontractorCompliance");
  const confirm = useConfirm();
  const ta = useTranslations("a11y");
  const {
    data: documents = null,
    error: documentsError,
    reload: reloadDocuments,
  } = useApi<SubcontractorDocument[]>(`/finance/subcontractors/${s.id}/documents`);
  useReloadOnVersion(version, reloadDocuments);
  const [docForm, setDocForm] = useState({ type: "general_liability_insurance" as SubcontractorDocumentType, name: "", expiresAt: "" });

  async function addDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!docForm.name || !docForm.expiresAt) return;
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${s.id}/documents`, {
        method: "POST",
        body: JSON.stringify({ type: docForm.type, name: docForm.name, expiresAt: new Date(docForm.expiresAt).toISOString() }),
      });
      setDocForm({ type: "general_liability_insurance", name: "", expiresAt: "" });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeDocument(documentId: string) {
    if (!(await confirm({ message: t("confirmDeleteDocument"), tone: "danger", verb: "delete" }))) return;
    await apiFetch(`/finance/subcontractors/${s.id}/documents/${documentId}`, { method: "DELETE" });
    refresh();
  }

  return (
    <>
      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("documents")}</h3>
        {documents === null ? (
          documentsError ? <ErrorState error={documentsError} onRetry={reloadDocuments} compact /> : <Skeleton lines={3} />
        ) : documents.length === 0 ? (
          <p className="text-xs text-fg-subtle">{t("noDocuments")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {documents.map((doc) => {
              const expired = new Date(doc.expiresAt) < new Date();
              return (
                <li key={doc.id} className="flex items-center justify-between text-xs">
                  <span>
                    <span className="text-fg-subtle">{t(doc.type)}</span> — {doc.name}
                    {" · "}
                    <span className={expired ? "text-danger-fg" : "text-fg-subtle"}>
                      {formatDate(new Date(doc.expiresAt))}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <CertificateAttachment param="subcontractorDocumentId" entityId={doc.id} />
                    <button aria-label={ta("removeItem", { name: doc.name })} onClick={() => removeDocument(doc.id)} className="text-fg-subtle hover:text-danger-fg">
                      ×
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form onSubmit={addDocument} className="flex flex-wrap items-end gap-2">
        <select aria-label={ta("documentType")}
          className="input w-auto"
          value={docForm.type}
          onChange={(e) => setDocForm((f) => ({ ...f, type: e.target.value as SubcontractorDocumentType }))}
        >
          {DOCUMENT_TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(ty)}
            </option>
          ))}
        </select>
        <input
          required
          placeholder={t("documentNamePlaceholder")} aria-label={t("documentNamePlaceholder")}
          className="input w-auto"
          value={docForm.name}
          onChange={(e) => setDocForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input aria-label={ta("expiryDate")}
          required
          type="date"
          className="input w-auto"
          value={docForm.expiresAt}
          onChange={(e) => setDocForm((f) => ({ ...f, expiresAt: e.target.value }))}
        />
        <button type="submit" disabled={busy} className="btn-secondary px-2.5 py-1 text-xs">
          {t("addDocument")}
        </button>
      </form>
    </>
  );
}
