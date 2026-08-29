"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { COMPANY_DOCUMENT_TYPES, type CompanyDocumentType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { CertificateAttachment } from "@/components/certificate-attachment";

interface CompanyDocument {
  id: string;
  type: CompanyDocumentType;
  name: string;
  expiresAt: string;
}
interface Company {
  coiPublicToken: string | null;
  coiPubliclyShared: boolean;
}

export function CompanyCoiPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("companyCoi");
  const tc = useTranslations("common");

  const [company, setCompany] = useState<Company | null>(null);
  const [documents, setDocuments] = useState<CompanyDocument[] | null>(null);
  const [docForm, setDocForm] = useState({ type: "general_liability_insurance" as CompanyDocumentType, name: "", expiresAt: "" });
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  function load() {
    apiFetch<Company>("/company").then(setCompany);
    apiFetch<CompanyDocument[]>("/company/coi-documents").then(setDocuments);
  }

  useEffect(load, []);

  async function addDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!docForm.name || !docForm.expiresAt) return;
    setBusy(true);
    try {
      await apiFetch("/company/coi-documents", {
        method: "POST",
        body: JSON.stringify({ type: docForm.type, name: docForm.name, expiresAt: new Date(docForm.expiresAt).toISOString() }),
      });
      setDocForm({ type: "general_liability_insurance", name: "", expiresAt: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function removeDocument(id: string) {
    await apiFetch(`/company/coi-documents/${id}`, { method: "DELETE" });
    load();
  }

  async function togglePublicShare(shared: boolean) {
    setBusy(true);
    try {
      await apiFetch("/company/coi-documents/public-share", {
        method: "PATCH",
        body: JSON.stringify({ coiPubliclyShared: shared }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  function copyLink() {
    if (!company?.coiPublicToken) return;
    const link = `${window.location.origin}/company-coi/${company.coiPublicToken}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-4 text-xs text-gray-500">{t("hint")}</p>

      {documents === null ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noDocuments")}</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-1.5">
          {documents.map((doc) => {
            const expired = new Date(doc.expiresAt) < new Date();
            return (
              <li key={doc.id} className="flex items-center justify-between text-sm">
                <span>
                  <span className="text-gray-500">{t(doc.type)}</span> — {doc.name}
                  {" · "}
                  <span className={expired ? "text-error-700" : "text-gray-500"}>{new Date(doc.expiresAt).toLocaleDateString()}</span>
                </span>
                {canManage && (
                  <span className="flex items-center gap-2">
                    <CertificateAttachment param="companyDocumentId" entityId={doc.id} />
                    <button onClick={() => removeDocument(doc.id)} className="text-gray-400 hover:text-error-600">
                      ×
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && (
        <>
          <form onSubmit={addDocument} className="flex flex-wrap items-end gap-2">
            <select
              className="input w-auto"
              value={docForm.type}
              onChange={(e) => setDocForm((f) => ({ ...f, type: e.target.value as CompanyDocumentType }))}
            >
              {COMPANY_DOCUMENT_TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {t(ty)}
                </option>
              ))}
            </select>
            <input
              required
              placeholder={t("documentNamePlaceholder")}
              className="input w-auto"
              value={docForm.name}
              onChange={(e) => setDocForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
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

          <div className="mt-4 border-t border-gray-100 pt-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={company?.coiPubliclyShared ?? false}
                disabled={busy}
                onChange={(e) => togglePublicShare(e.target.checked)}
              />
              {t("shareEnabled")}
            </label>
            {company?.coiPubliclyShared && company.coiPublicToken && (
              <div className="mt-2 flex items-center gap-2">
                <input readOnly className="input flex-1 text-xs" value={`${window.location.origin}/company-coi/${company.coiPublicToken}`} />
                <button onClick={copyLink} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
                  {copied ? t("copied") : t("copyLink")}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
