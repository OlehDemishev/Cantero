"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { SubcontractorDocumentType } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { CertificateAttachment } from "@/components/certificate-attachment";
import { apiFetch } from "@/lib/api-client";

const DOCUMENT_TYPES: SubcontractorDocumentType[] = ["general_liability_insurance", "workers_comp_insurance", "license", "other"];

interface Subcontractor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}
interface SubcontractorDocument {
  id: string;
  type: SubcontractorDocumentType;
  name: string;
  expiresAt: string;
}
interface ComplianceRequirement {
  type: SubcontractorDocumentType;
  status: "missing" | "expired" | "valid";
  expiresAt: string | null;
}
interface Compliance {
  compliant: boolean;
  requirements: ComplianceRequirement[];
}

export default function SubcontractorsPage() {
  const t = useTranslations("subcontractorCompliance");
  const tc = useTranslations("common");

  const [subcontractors, setSubcontractors] = useState<Subcontractor[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<SubcontractorDocument[] | null>(null);
  const [compliance, setCompliance] = useState<Compliance | null>(null);
  const [newForm, setNewForm] = useState({ name: "", email: "", phone: "" });
  const [docForm, setDocForm] = useState({ type: "general_liability_insurance" as SubcontractorDocumentType, name: "", expiresAt: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Subcontractor[]>("/finance/subcontractors").then(setSubcontractors);
  }

  useEffect(load, []);

  function loadDetail(id: string) {
    apiFetch<SubcontractorDocument[]>(`/finance/subcontractors/${id}/documents`).then(setDocuments);
    apiFetch<Compliance>(`/finance/subcontractors/${id}/compliance`).then(setCompliance);
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDocuments(null);
      setCompliance(null);
      return;
    }
    setExpandedId(id);
    setDocuments(null);
    setCompliance(null);
    loadDetail(id);
  }

  async function createSubcontractor(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/finance/subcontractors", {
        method: "POST",
        body: JSON.stringify({ name: newForm.name, email: newForm.email || undefined, phone: newForm.phone || undefined }),
      });
      setNewForm({ name: "", email: "", phone: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function addDocument(e: React.FormEvent, subcontractorId: string) {
    e.preventDefault();
    if (!docForm.name || !docForm.expiresAt) return;
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${subcontractorId}/documents`, {
        method: "POST",
        body: JSON.stringify({ type: docForm.type, name: docForm.name, expiresAt: new Date(docForm.expiresAt).toISOString() }),
      });
      setDocForm({ type: "general_liability_insurance", name: "", expiresAt: "" });
      loadDetail(subcontractorId);
    } finally {
      setBusy(false);
    }
  }

  async function removeDocument(subcontractorId: string, documentId: string) {
    await apiFetch(`/finance/subcontractors/${subcontractorId}/documents/${documentId}`, { method: "DELETE" });
    loadDetail(subcontractorId);
  }

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-gray-500">{t("complianceSubtitle")}</p>

      <div className="mt-6 card max-w-md">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">{t("newSubcontractor")}</h2>
        <form onSubmit={createSubcontractor} className="flex flex-col gap-3">
          <input required placeholder={tc("name")} className="input" value={newForm.name} onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))} />
          <input type="email" placeholder={tc("email")} className="input" value={newForm.email} onChange={(e) => setNewForm((f) => ({ ...f, email: e.target.value }))} />
          <input placeholder={tc("phone")} className="input" value={newForm.phone} onChange={(e) => setNewForm((f) => ({ ...f, phone: e.target.value }))} />
          <button type="submit" disabled={busy} className="btn-primary self-start">
            {tc("create")}
          </button>
        </form>
      </div>

      <div className="mt-8">
        {!subcontractors ? (
          <p className="text-gray-500">{tc("loading")}</p>
        ) : subcontractors.length === 0 ? (
          <p className="text-sm text-gray-400">{t("noSubcontractors")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {subcontractors.map((s) => {
              const expanded = expandedId === s.id;
              return (
                <li key={s.id} className="card">
                  <button onClick={() => toggleExpand(s.id)} className="flex w-full items-center justify-between text-left">
                    <div>
                      <span className="text-sm font-medium text-gray-900">{s.name}</span>
                      {s.email && <span className="ml-2 text-xs text-gray-400">{s.email}</span>}
                    </div>
                    {expanded && compliance && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          compliance.compliant ? "bg-success-50 text-success-700" : "bg-error-50 text-error-700"
                        }`}
                      >
                        {compliance.compliant ? t("compliant") : t("nonCompliant")}
                      </span>
                    )}
                  </button>

                  {expanded && (
                    <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 pt-3">
                      {compliance && (
                        <ul className="flex flex-col gap-1">
                          {compliance.requirements.map((r) => (
                            <li key={r.type} className="flex items-center justify-between text-xs">
                              <span className="text-gray-600">{t(r.type)}</span>
                              <span
                                className={
                                  r.status === "valid"
                                    ? "text-success-700"
                                    : r.status === "expired"
                                      ? "text-error-700"
                                      : "text-gray-400"
                                }
                              >
                                {r.status === "valid" && r.expiresAt
                                  ? t("validUntil", { date: new Date(r.expiresAt).toLocaleDateString() })
                                  : r.status === "expired" && r.expiresAt
                                    ? t("expiredOn", { date: new Date(r.expiresAt).toLocaleDateString() })
                                    : t("missing")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div>
                        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("documents")}</h3>
                        {documents === null ? (
                          <p className="text-xs text-gray-400">{tc("loading")}</p>
                        ) : documents.length === 0 ? (
                          <p className="text-xs text-gray-400">{t("noDocuments")}</p>
                        ) : (
                          <ul className="flex flex-col gap-1.5">
                            {documents.map((doc) => {
                              const expired = new Date(doc.expiresAt) < new Date();
                              return (
                                <li key={doc.id} className="flex items-center justify-between text-xs">
                                  <span>
                                    <span className="text-gray-500">{t(doc.type)}</span> — {doc.name}
                                    {" · "}
                                    <span className={expired ? "text-error-700" : "text-gray-500"}>
                                      {new Date(doc.expiresAt).toLocaleDateString()}
                                    </span>
                                  </span>
                                  <span className="flex items-center gap-2">
                                    <CertificateAttachment subcontractorDocumentId={doc.id} />
                                    <button onClick={() => removeDocument(s.id, doc.id)} className="text-gray-400 hover:text-error-600">
                                      ×
                                    </button>
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>

                      <form onSubmit={(e) => addDocument(e, s.id)} className="flex flex-wrap items-end gap-2">
                        <select
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
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AuthenticatedShell>
  );
}
