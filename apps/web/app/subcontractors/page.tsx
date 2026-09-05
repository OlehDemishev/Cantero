"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SUBCONTRACTOR_DIVERSITY_CATEGORIES, type SubcontractorDiversityCategory, type SubcontractorDocumentType } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { CertificateAttachment } from "@/components/certificate-attachment";
import { SubcontractorPrequalificationPanel } from "@/components/subcontractor-prequalification-panel";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

const DOCUMENT_TYPES: SubcontractorDocumentType[] = ["general_liability_insurance", "workers_comp_insurance", "license", "bonding", "other"];

interface Subcontractor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  specialization: string | null;
  bio: string | null;
  publicListed: boolean;
  publicToken: string | null;
  licenseNumber: string | null;
  bondingCapacity: string | null;
  safetyProgramSummary: string | null;
  diversityCertifications: SubcontractorDiversityCategory[];
  diversityCertificationExpiresAt: string | null;
}
interface PerformanceReview {
  id: string;
  reviewedByName: string;
  rating: number;
  onTime: boolean | null;
  safetyIncidents: number;
  reworkCount: number;
  wouldHireAgain: boolean | null;
  comments: string | null;
  createdAt: string;
}
interface Scorecard {
  reviewCount: number;
  averageRating: number | null;
  onTimePercent: number | null;
  wouldHireAgainPercent: number | null;
  totalSafetyIncidents: number;
  totalReworkCount: number;
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
interface TaxProfile {
  taxId: string | null;
  legalBusinessName: string | null;
  mailingAddress: string | null;
}
interface SubcontractorPayment {
  id: string;
  amount: string;
  paidAt: string;
  note: string | null;
}
interface TaxSummaryRow {
  subcontractorId: string;
  name: string;
  legalBusinessName: string | null;
  taxIdMasked: string | null;
  mailingAddress: string | null;
  totalPaid: number;
  reportable: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();

export default function SubcontractorsPage() {
  const t = useTranslations("subcontractorCompliance");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const isUsCompany = me?.company.country === "US";

  const [subcontractors, setSubcontractors] = useState<Subcontractor[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<SubcontractorDocument[] | null>(null);
  const [compliance, setCompliance] = useState<Compliance | null>(null);
  const [newForm, setNewForm] = useState({ name: "", email: "", phone: "" });
  const [docForm, setDocForm] = useState({ type: "general_liability_insurance" as SubcontractorDocumentType, name: "", expiresAt: "" });
  const [profileForm, setProfileForm] = useState({ specialization: "", bio: "", licenseNumber: "", bondingCapacity: "", safetyProgramSummary: "" });
  const [diversityForm, setDiversityForm] = useState<{ categories: SubcontractorDiversityCategory[]; expiresAt: string }>({
    categories: [],
    expiresAt: "",
  });
  const [linkCopiedId, setLinkCopiedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [reviews, setReviews] = useState<PerformanceReview[] | null>(null);
  const [reviewForm, setReviewForm] = useState({ rating: "5", onTime: "", safetyIncidents: "0", reworkCount: "0", wouldHireAgain: "", comments: "" });
  const [taxProfile, setTaxProfile] = useState<TaxProfile | null>(null);
  const [taxForm, setTaxForm] = useState({ taxId: "", legalBusinessName: "", mailingAddress: "" });
  const [payments, setPayments] = useState<SubcontractorPayment[] | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: "", paidAt: "", note: "" });
  const [taxSummaryYear, setTaxSummaryYear] = useState(String(CURRENT_YEAR));
  const [taxSummary, setTaxSummary] = useState<TaxSummaryRow[] | null>(null);

  function load() {
    apiFetch<Subcontractor[]>("/finance/subcontractors").then(setSubcontractors);
  }

  useEffect(load, []);

  function loadTaxSummary(year: string) {
    apiFetch<TaxSummaryRow[]>(`/finance/subcontractors/tax-summary?year=${year}`).then(setTaxSummary);
  }

  useEffect(() => {
    if (isUsCompany) loadTaxSummary(taxSummaryYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUsCompany]);

  function loadDetail(id: string) {
    apiFetch<SubcontractorDocument[]>(`/finance/subcontractors/${id}/documents`).then(setDocuments);
    apiFetch<Compliance>(`/finance/subcontractors/${id}/compliance`).then(setCompliance);
    apiFetch<Scorecard>(`/finance/subcontractors/${id}/scorecard`).then(setScorecard);
    apiFetch<PerformanceReview[]>(`/finance/subcontractors/${id}/performance-reviews`).then(setReviews);
    if (isUsCompany) {
      apiFetch<TaxProfile>(`/finance/subcontractors/${id}/tax-profile`).then((p) => {
        setTaxProfile(p);
        setTaxForm({ taxId: p.taxId ?? "", legalBusinessName: p.legalBusinessName ?? "", mailingAddress: p.mailingAddress ?? "" });
      });
      apiFetch<SubcontractorPayment[]>(`/finance/subcontractors/${id}/payments`).then(setPayments);
    }
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDocuments(null);
      setCompliance(null);
      setScorecard(null);
      setReviews(null);
      setTaxProfile(null);
      setPayments(null);
      return;
    }
    setExpandedId(id);
    setDocuments(null);
    setCompliance(null);
    setScorecard(null);
    setReviews(null);
    setTaxProfile(null);
    setPayments(null);
    const sub = subcontractors?.find((s) => s.id === id);
    setProfileForm({
      specialization: sub?.specialization ?? "",
      bio: sub?.bio ?? "",
      licenseNumber: sub?.licenseNumber ?? "",
      bondingCapacity: sub?.bondingCapacity ?? "",
      safetyProgramSummary: sub?.safetyProgramSummary ?? "",
    });
    setDiversityForm({
      categories: sub?.diversityCertifications ?? [],
      expiresAt: sub?.diversityCertificationExpiresAt ? sub.diversityCertificationExpiresAt.slice(0, 10) : "",
    });
    loadDetail(id);
  }

  function toggleDiversityCategory(category: SubcontractorDiversityCategory) {
    setDiversityForm((f) => ({
      ...f,
      categories: f.categories.includes(category) ? f.categories.filter((c) => c !== category) : [...f.categories, category],
    }));
  }

  async function saveDiversityCertifications(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${id}/diversity-certifications`, {
        method: "PATCH",
        body: JSON.stringify({
          diversityCertifications: diversityForm.categories,
          diversityCertificationExpiresAt: diversityForm.expiresAt ? new Date(diversityForm.expiresAt).toISOString() : null,
        }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function saveTaxProfile(e: React.FormEvent, id: string) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${id}/tax-profile`, {
        method: "PATCH",
        body: JSON.stringify({
          taxId: taxForm.taxId || null,
          legalBusinessName: taxForm.legalBusinessName || null,
          mailingAddress: taxForm.mailingAddress || null,
        }),
      });
      loadDetail(id);
    } finally {
      setBusy(false);
    }
  }

  async function addPayment(e: React.FormEvent, id: string) {
    e.preventDefault();
    if (!paymentForm.amount) return;
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(paymentForm.amount),
          paidAt: paymentForm.paidAt ? new Date(paymentForm.paidAt).toISOString() : undefined,
          note: paymentForm.note || undefined,
        }),
      });
      setPaymentForm({ amount: "", paidAt: "", note: "" });
      loadDetail(id);
      loadTaxSummary(taxSummaryYear);
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(e: React.FormEvent, id: string) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${id}/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          specialization: profileForm.specialization || null,
          bio: profileForm.bio || null,
          licenseNumber: profileForm.licenseNumber || null,
          bondingCapacity: profileForm.bondingCapacity ? Number(profileForm.bondingCapacity) : null,
          safetyProgramSummary: profileForm.safetyProgramSummary || null,
        }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function addReview(e: React.FormEvent, id: string) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${id}/performance-reviews`, {
        method: "POST",
        body: JSON.stringify({
          rating: Number(reviewForm.rating),
          onTime: reviewForm.onTime ? reviewForm.onTime === "yes" : undefined,
          safetyIncidents: Number(reviewForm.safetyIncidents) || 0,
          reworkCount: Number(reviewForm.reworkCount) || 0,
          wouldHireAgain: reviewForm.wouldHireAgain ? reviewForm.wouldHireAgain === "yes" : undefined,
          comments: reviewForm.comments || undefined,
        }),
      });
      setReviewForm({ rating: "5", onTime: "", safetyIncidents: "0", reworkCount: "0", wouldHireAgain: "", comments: "" });
      loadDetail(id);
    } finally {
      setBusy(false);
    }
  }

  async function togglePublic(id: string, publicListed: boolean) {
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${id}/public-listed`, {
        method: "PATCH",
        body: JSON.stringify({ publicListed }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  function copyLink(token: string, id: string) {
    const url = `${window.location.origin}/subcontractor-profile/${token}`;
    navigator.clipboard.writeText(url);
    setLinkCopiedId(id);
    setTimeout(() => setLinkCopiedId(null), 2000);
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
                                    <CertificateAttachment param="subcontractorDocumentId" entityId={doc.id} />
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

                      <div className="border-t border-gray-100 pt-3">
                        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("prequalification")}</h3>
                        <p className="mb-2 text-xs text-gray-500">{t("prequalificationHint")}</p>
                        <form onSubmit={(e) => saveProfile(e, s.id)} className="flex flex-col gap-2">
                          <input
                            placeholder={t("specializationPlaceholder")}
                            className="input"
                            value={profileForm.specialization}
                            onChange={(e) => setProfileForm((f) => ({ ...f, specialization: e.target.value }))}
                          />
                          <textarea
                            rows={2}
                            placeholder={t("bioPlaceholder")}
                            className="input"
                            value={profileForm.bio}
                            onChange={(e) => setProfileForm((f) => ({ ...f, bio: e.target.value }))}
                          />
                          <div className="flex flex-wrap gap-2">
                            <input
                              placeholder={t("licenseNumberPlaceholder")}
                              className="input"
                              value={profileForm.licenseNumber}
                              onChange={(e) => setProfileForm((f) => ({ ...f, licenseNumber: e.target.value }))}
                            />
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder={t("bondingCapacityPlaceholder")}
                              className="input w-40"
                              value={profileForm.bondingCapacity}
                              onChange={(e) => setProfileForm((f) => ({ ...f, bondingCapacity: e.target.value }))}
                            />
                          </div>
                          <textarea
                            rows={2}
                            placeholder={t("safetyProgramPlaceholder")}
                            className="input"
                            value={profileForm.safetyProgramSummary}
                            onChange={(e) => setProfileForm((f) => ({ ...f, safetyProgramSummary: e.target.value }))}
                          />
                          <button type="submit" disabled={busy} className="btn-secondary self-start px-2.5 py-1 text-xs">
                            {tc("save")}
                          </button>
                        </form>
                        <div className="mt-2 flex items-center gap-2">
                          <label className="flex items-center gap-1.5 text-xs text-gray-700">
                            <input
                              type="checkbox"
                              checked={s.publicListed}
                              onChange={(e) => togglePublic(s.id, e.target.checked)}
                              disabled={busy}
                            />
                            {t("makePublic")}
                          </label>
                          {s.publicListed && s.publicToken && (
                            <button onClick={() => copyLink(s.publicToken!, s.id)} className="btn-secondary px-2 py-0.5 text-xs">
                              {linkCopiedId === s.id ? tc("saved") : t("copyPublicLink")}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-gray-100 pt-3">
                        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("diversityCertifications")}</h3>
                        <p className="mb-2 text-xs text-gray-500">{t("diversityCertificationsHint")}</p>
                        <div className="mb-2 flex flex-wrap gap-3">
                          {SUBCONTRACTOR_DIVERSITY_CATEGORIES.map((category) => (
                            <label key={category} className="flex items-center gap-1.5 text-xs text-gray-700">
                              <input
                                type="checkbox"
                                checked={diversityForm.categories.includes(category)}
                                onChange={() => toggleDiversityCategory(category)}
                              />
                              {t(`diversityCategory_${category}`)}
                            </label>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="flex flex-col gap-1 text-xs text-gray-500">
                            {t("diversityCertificationExpiresAt")}
                            <input
                              type="date"
                              className="input"
                              value={diversityForm.expiresAt}
                              onChange={(e) => setDiversityForm((f) => ({ ...f, expiresAt: e.target.value }))}
                            />
                          </label>
                          <button onClick={() => saveDiversityCertifications(s.id)} disabled={busy} className="btn-secondary px-2.5 py-1 text-xs">
                            {tc("save")}
                          </button>
                        </div>
                      </div>

                      <SubcontractorPrequalificationPanel subcontractorId={s.id} />

                      <div className="border-t border-gray-100 pt-3">
                        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("scorecard")}</h3>
                        {scorecard && (
                          <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                            <div>
                              <div className="text-gray-500">{t("averageRating")}</div>
                              <div className="font-semibold">{scorecard.averageRating ?? "—"}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">{t("onTimePercent")}</div>
                              <div className="font-semibold">{scorecard.onTimePercent !== null ? `${scorecard.onTimePercent}%` : "—"}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">{t("wouldHireAgainPercent")}</div>
                              <div className="font-semibold">{scorecard.wouldHireAgainPercent !== null ? `${scorecard.wouldHireAgainPercent}%` : "—"}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">{t("reviewCount")}</div>
                              <div className="font-semibold">{scorecard.reviewCount}</div>
                            </div>
                          </div>
                        )}

                        {reviews && reviews.length > 0 && (
                          <ul className="mb-3 flex flex-col gap-1.5">
                            {reviews.map((r) => (
                              <li key={r.id} className="text-xs text-gray-600">
                                <span className="font-medium">{"★".repeat(r.rating)}</span> — {r.reviewedByName},{" "}
                                {new Date(r.createdAt).toLocaleDateString()}
                                {r.comments && <span className="text-gray-500"> · {r.comments}</span>}
                              </li>
                            ))}
                          </ul>
                        )}

                        <form onSubmit={(e) => addReview(e, s.id)} className="flex flex-wrap items-end gap-2">
                          <label className="flex flex-col gap-1 text-xs text-gray-500">
                            {t("rating")}
                            <select
                              className="input w-auto"
                              value={reviewForm.rating}
                              onChange={(e) => setReviewForm((f) => ({ ...f, rating: e.target.value }))}
                            >
                              {[5, 4, 3, 2, 1].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-gray-500">
                            {t("onTime")}
                            <select className="input w-auto" value={reviewForm.onTime} onChange={(e) => setReviewForm((f) => ({ ...f, onTime: e.target.value }))}>
                              <option value="">—</option>
                              <option value="yes">{tc("yes")}</option>
                              <option value="no">{tc("no")}</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-gray-500">
                            {t("wouldHireAgain")}
                            <select
                              className="input w-auto"
                              value={reviewForm.wouldHireAgain}
                              onChange={(e) => setReviewForm((f) => ({ ...f, wouldHireAgain: e.target.value }))}
                            >
                              <option value="">—</option>
                              <option value="yes">{tc("yes")}</option>
                              <option value="no">{tc("no")}</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-gray-500">
                            {t("safetyIncidents")}
                            <input
                              type="number"
                              min="0"
                              className="input w-20"
                              value={reviewForm.safetyIncidents}
                              onChange={(e) => setReviewForm((f) => ({ ...f, safetyIncidents: e.target.value }))}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-gray-500">
                            {t("reworkCount")}
                            <input
                              type="number"
                              min="0"
                              className="input w-20"
                              value={reviewForm.reworkCount}
                              onChange={(e) => setReviewForm((f) => ({ ...f, reworkCount: e.target.value }))}
                            />
                          </label>
                          <input
                            placeholder={t("reviewCommentsPlaceholder")}
                            className="input"
                            value={reviewForm.comments}
                            onChange={(e) => setReviewForm((f) => ({ ...f, comments: e.target.value }))}
                          />
                          <button type="submit" disabled={busy} className="btn-secondary px-2.5 py-1 text-xs">
                            {t("addReview")}
                          </button>
                        </form>
                      </div>

                      {isUsCompany && (
                        <div className="border-t border-gray-100 pt-3">
                          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("taxProfile")}</h3>
                          <p className="mb-2 text-xs text-gray-500">{t("taxProfileHint")}</p>
                          <form onSubmit={(e) => saveTaxProfile(e, s.id)} className="flex flex-col gap-2">
                            <input
                              placeholder={t("taxIdPlaceholder")}
                              className="input"
                              value={taxForm.taxId}
                              onChange={(e) => setTaxForm((f) => ({ ...f, taxId: e.target.value }))}
                            />
                            <input
                              placeholder={t("legalBusinessNamePlaceholder")}
                              className="input"
                              value={taxForm.legalBusinessName}
                              onChange={(e) => setTaxForm((f) => ({ ...f, legalBusinessName: e.target.value }))}
                            />
                            <textarea
                              rows={2}
                              placeholder={t("mailingAddressPlaceholder")}
                              className="input"
                              value={taxForm.mailingAddress}
                              onChange={(e) => setTaxForm((f) => ({ ...f, mailingAddress: e.target.value }))}
                            />
                            <button type="submit" disabled={busy} className="btn-secondary self-start px-2.5 py-1 text-xs">
                              {tc("save")}
                            </button>
                          </form>

                          <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("payments")}</h3>
                          {payments === null ? (
                            <p className="text-xs text-gray-400">{tc("loading")}</p>
                          ) : payments.length === 0 ? (
                            <p className="mb-2 text-xs text-gray-400">{t("noPayments")}</p>
                          ) : (
                            <ul className="mb-2 flex flex-col gap-1">
                              {payments.map((p) => (
                                <li key={p.id} className="flex items-center justify-between text-xs">
                                  <span className="text-gray-500">
                                    {new Date(p.paidAt).toLocaleDateString()}
                                    {p.note && ` · ${p.note}`}
                                  </span>
                                  <span className="font-medium">{p.amount}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          <form onSubmit={(e) => addPayment(e, s.id)} className="flex flex-wrap items-end gap-2">
                            <input
                              required
                              type="number"
                              step="0.01"
                              placeholder={t("amount")}
                              className="input w-28"
                              value={paymentForm.amount}
                              onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                            />
                            <input
                              type="date"
                              className="input w-auto"
                              value={paymentForm.paidAt}
                              onChange={(e) => setPaymentForm((f) => ({ ...f, paidAt: e.target.value }))}
                            />
                            <input
                              placeholder={t("paymentNotePlaceholder")}
                              className="input"
                              value={paymentForm.note}
                              onChange={(e) => setPaymentForm((f) => ({ ...f, note: e.target.value }))}
                            />
                            <button type="submit" disabled={busy} className="btn-secondary px-2.5 py-1 text-xs">
                              {t("recordPayment")}
                            </button>
                          </form>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {isUsCompany && (
        <div className="mt-8 card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">{t("taxSummaryTitle")}</h2>
            <select
              className="input w-auto"
              value={taxSummaryYear}
              onChange={(e) => {
                setTaxSummaryYear(e.target.value);
                loadTaxSummary(e.target.value);
              }}
            >
              {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <p className="mb-3 text-xs text-gray-500">{t("taxSummaryHint")}</p>
          {taxSummary === null ? (
            <p className="text-sm text-gray-400">{tc("loading")}</p>
          ) : taxSummary.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noTaxSummary")}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                  <th className="py-1.5 font-medium">{tc("name")}</th>
                  <th className="font-medium">{t("legalBusinessNamePlaceholder")}</th>
                  <th className="font-medium">{t("taxIdPlaceholder")}</th>
                  <th className="text-right font-medium">{t("totalPaid")}</th>
                  <th className="text-right font-medium">{t("reportable")}</th>
                </tr>
              </thead>
              <tbody>
                {taxSummary.map((row) => (
                  <tr key={row.subcontractorId} className="border-b border-gray-100">
                    <td className="py-1.5">{row.name}</td>
                    <td className="text-gray-500">{row.legalBusinessName ?? "—"}</td>
                    <td className="text-gray-500">{row.taxIdMasked ?? "—"}</td>
                    <td className="text-right font-medium">{row.totalPaid}</td>
                    <td className="text-right">
                      {row.reportable ? (
                        <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-700">{t("reportableYes")}</span>
                      ) : (
                        <span className="text-xs text-gray-400">{t("reportableNo")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </AuthenticatedShell>
  );
}
