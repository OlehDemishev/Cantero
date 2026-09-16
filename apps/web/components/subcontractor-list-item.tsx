"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { SUBCONTRACTOR_DIVERSITY_CATEGORIES, type SubcontractorDiversityCategory, type SubcontractorDocumentType } from "@cantero/shared";
import { CertificateAttachment } from "@/components/certificate-attachment";
import { SubcontractorPrequalificationPanel } from "@/components/subcontractor-prequalification-panel";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

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
  datevKreditorNumber: string | null;
}
interface SubcontractorPayment {
  id: string;
  amount: string;
  paidAt: string;
  note: string | null;
}
interface Assignment {
  id: string;
  startDate: string | null;
  endDate: string | null;
  actualEndDate: string | null;
  project: { id: string; name: string };
}
interface SubcontractorCost {
  id: string;
  description: string;
  amount: string;
  incurredDate: string;
  paid: boolean;
  project: { id: string; name: string };
}

/** One subcontractor's expandable card: compliance, documents, prequalification profile,
 * diversity certs, performance scorecard, and (US only) tax profile + 1099 payment log. Fetches
 * its own detail data on first expand and manages every field independently — the parent only
 * needs the row's own fields (name/email) and an `onChanged` nudge after a save that could affect
 * how the row looks the next time the list reloads. */
export function SubcontractorListItem({
  subcontractor: s,
  isUsCompany,
  onChanged,
}: {
  subcontractor: Subcontractor;
  isUsCompany: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("subcontractorCompliance");
  const tc = useTranslations("common");

  const [expanded, setExpanded] = useState(false);
  const [documents, setDocuments] = useState<SubcontractorDocument[] | null>(null);
  const [compliance, setCompliance] = useState<Compliance | null>(null);
  const [docForm, setDocForm] = useState({ type: "general_liability_insurance" as SubcontractorDocumentType, name: "", expiresAt: "" });
  const [profileForm, setProfileForm] = useState({
    specialization: s.specialization ?? "",
    bio: s.bio ?? "",
    licenseNumber: s.licenseNumber ?? "",
    bondingCapacity: s.bondingCapacity ?? "",
    safetyProgramSummary: s.safetyProgramSummary ?? "",
  });
  const [diversityForm, setDiversityForm] = useState<{ categories: SubcontractorDiversityCategory[]; expiresAt: string }>({
    categories: s.diversityCertifications ?? [],
    expiresAt: s.diversityCertificationExpiresAt ? s.diversityCertificationExpiresAt.slice(0, 10) : "",
  });
  const [linkCopied, setLinkCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [reviews, setReviews] = useState<PerformanceReview[] | null>(null);
  const [reviewForm, setReviewForm] = useState({ rating: "5", onTime: "", safetyIncidents: "0", reworkCount: "0", wouldHireAgain: "", comments: "" });
  const [taxForm, setTaxForm] = useState({ taxId: "", legalBusinessName: "", mailingAddress: "", datevKreditorNumber: "" });
  const [payments, setPayments] = useState<SubcontractorPayment[] | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: "", paidAt: "", note: "" });
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [costs, setCosts] = useState<SubcontractorCost[] | null>(null);

  function loadDetail() {
    apiFetch<SubcontractorDocument[]>(`/finance/subcontractors/${s.id}/documents`).then(setDocuments);
    apiFetch<Compliance>(`/finance/subcontractors/${s.id}/compliance`).then(setCompliance);
    apiFetch<Scorecard>(`/finance/subcontractors/${s.id}/scorecard`).then(setScorecard);
    apiFetch<PerformanceReview[]>(`/finance/subcontractors/${s.id}/performance-reviews`).then(setReviews);
    apiFetch<Assignment[]>(`/finance/subcontractors/${s.id}/assignments`).then(setAssignments);
    apiFetch<SubcontractorCost[]>(`/finance/subcontractor-costs?subcontractorId=${s.id}`).then(setCosts);
    // Tax profile carries both US 1099 fields and the DATEV Kreditor number, so it's fetched
    // regardless of isUsCompany — only the US-specific inputs/payments ledger below stay gated.
    apiFetch<TaxProfile>(`/finance/subcontractors/${s.id}/tax-profile`).then((p) =>
      setTaxForm({
        taxId: p.taxId ?? "",
        legalBusinessName: p.legalBusinessName ?? "",
        mailingAddress: p.mailingAddress ?? "",
        datevKreditorNumber: p.datevKreditorNumber ?? "",
      }),
    );
    if (isUsCompany) {
      apiFetch<SubcontractorPayment[]>(`/finance/subcontractors/${s.id}/payments`).then(setPayments);
    }
  }

  function toggleExpand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    loadDetail();
  }

  function toggleDiversityCategory(category: SubcontractorDiversityCategory) {
    setDiversityForm((f) => ({
      ...f,
      categories: f.categories.includes(category) ? f.categories.filter((c) => c !== category) : [...f.categories, category],
    }));
  }

  async function saveDiversityCertifications() {
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${s.id}/diversity-certifications`, {
        method: "PATCH",
        body: JSON.stringify({
          diversityCertifications: diversityForm.categories,
          diversityCertificationExpiresAt: diversityForm.expiresAt ? new Date(diversityForm.expiresAt).toISOString() : null,
        }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function saveTaxProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${s.id}/tax-profile`, {
        method: "PATCH",
        body: JSON.stringify({
          taxId: taxForm.taxId || null,
          legalBusinessName: taxForm.legalBusinessName || null,
          mailingAddress: taxForm.mailingAddress || null,
          datevKreditorNumber: taxForm.datevKreditorNumber || null,
        }),
      });
      loadDetail();
    } finally {
      setBusy(false);
    }
  }

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentForm.amount) return;
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${s.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(paymentForm.amount),
          paidAt: paymentForm.paidAt ? new Date(paymentForm.paidAt).toISOString() : undefined,
          note: paymentForm.note || undefined,
        }),
      });
      setPaymentForm({ amount: "", paidAt: "", note: "" });
      loadDetail();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${s.id}/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          specialization: profileForm.specialization || null,
          bio: profileForm.bio || null,
          licenseNumber: profileForm.licenseNumber || null,
          bondingCapacity: profileForm.bondingCapacity ? Number(profileForm.bondingCapacity) : null,
          safetyProgramSummary: profileForm.safetyProgramSummary || null,
        }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function addReview(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${s.id}/performance-reviews`, {
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
      loadDetail();
    } finally {
      setBusy(false);
    }
  }

  async function togglePublic(publicListed: boolean) {
    setBusy(true);
    try {
      await apiFetch(`/finance/subcontractors/${s.id}/public-listed`, {
        method: "PATCH",
        body: JSON.stringify({ publicListed }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/subcontractor-profile/${token}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

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
      loadDetail();
    } finally {
      setBusy(false);
    }
  }

  async function removeDocument(documentId: string) {
    if (!window.confirm(t("confirmDeleteDocument"))) return;
    await apiFetch(`/finance/subcontractors/${s.id}/documents/${documentId}`, { method: "DELETE" });
    loadDetail();
  }

  return (
    <li className="card">
      <button onClick={toggleExpand} className="flex w-full items-center justify-between text-left">
        <div>
          <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{s.name}</span>
          {s.email && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{s.email}</span>}
        </div>
        {expanded && compliance && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              compliance.compliant ? "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500" : "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500"
            }`}
          >
            {compliance.compliant ? t("compliant") : t("nonCompliant")}
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 dark:border-gray-700 pt-3">
          {compliance && (
            <ul className="flex flex-col gap-1">
              {compliance.requirements.map((r) => (
                <li key={r.type} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-gray-300">{t(r.type)}</span>
                  <span
                    className={
                      r.status === "valid"
                        ? "text-success-700 dark:text-success-500"
                        : r.status === "expired"
                          ? "text-error-700 dark:text-error-500"
                          : "text-gray-400 dark:text-gray-500"
                    }
                  >
                    {r.status === "valid" && r.expiresAt
                      ? t("validUntil", { date: formatDate(new Date(r.expiresAt)) })
                      : r.status === "expired" && r.expiresAt
                        ? t("expiredOn", { date: formatDate(new Date(r.expiresAt)) })
                        : t("missing")}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("documents")}</h3>
            {documents === null ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">{tc("loading")}</p>
            ) : documents.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">{t("noDocuments")}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {documents.map((doc) => {
                  const expired = new Date(doc.expiresAt) < new Date();
                  return (
                    <li key={doc.id} className="flex items-center justify-between text-xs">
                      <span>
                        <span className="text-gray-500 dark:text-gray-400">{t(doc.type)}</span> — {doc.name}
                        {" · "}
                        <span className={expired ? "text-error-700 dark:text-error-500" : "text-gray-500 dark:text-gray-400"}>
                          {formatDate(new Date(doc.expiresAt))}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <CertificateAttachment param="subcontractorDocumentId" entityId={doc.id} />
                        <button onClick={() => removeDocument(doc.id)} className="text-gray-400 dark:text-gray-500 hover:text-error-600">
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

          <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("projects")}</h3>
            {assignments === null ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">{tc("loading")}</p>
            ) : assignments.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">{t("noAssignedProjects")}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {assignments.map((a) => (
                  <li key={a.id} className="text-xs">
                    <Link href={`/projects/${a.project.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                      {a.project.name}
                    </Link>
                    {a.startDate && (
                      <span className="text-gray-400 dark:text-gray-500">
                        {" "}
                        · {formatDate(new Date(a.startDate))}
                        {a.endDate && ` – ${formatDate(new Date(a.endDate))}`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("costsAcrossProjects")}</h3>
            {costs === null ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">{tc("loading")}</p>
            ) : costs.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">{t("noCostsYet")}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {costs.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-xs">
                    <span>
                      <Link href={`/projects/${c.project.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                        {c.project.name}
                      </Link>
                      <span className="text-gray-500 dark:text-gray-400"> — {c.description}</span>
                    </span>
                    <span className={c.paid ? "text-success-700 dark:text-success-500" : "text-gray-500 dark:text-gray-400"}>{c.amount}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("prequalification")}</h3>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("prequalificationHint")}</p>
            <form onSubmit={saveProfile} className="flex flex-col gap-2">
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
              <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={s.publicListed}
                  onChange={(e) => togglePublic(e.target.checked)}
                  disabled={busy}
                />
                {t("makePublic")}
              </label>
              {s.publicListed && s.publicToken && (
                <button onClick={() => copyLink(s.publicToken!)} className="btn-secondary px-2 py-0.5 text-xs">
                  {linkCopied ? tc("saved") : t("copyPublicLink")}
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("diversityCertifications")}</h3>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("diversityCertificationsHint")}</p>
            <div className="mb-2 flex flex-wrap gap-3">
              {SUBCONTRACTOR_DIVERSITY_CATEGORIES.map((category) => (
                <label key={category} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-200">
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
              <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                {t("diversityCertificationExpiresAt")}
                <input
                  type="date"
                  className="input"
                  value={diversityForm.expiresAt}
                  onChange={(e) => setDiversityForm((f) => ({ ...f, expiresAt: e.target.value }))}
                />
              </label>
              <button onClick={saveDiversityCertifications} disabled={busy} className="btn-secondary px-2.5 py-1 text-xs">
                {tc("save")}
              </button>
            </div>
          </div>

          <SubcontractorPrequalificationPanel subcontractorId={s.id} />

          <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("scorecard")}</h3>
            {scorecard && (
              <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div>
                  <div className="text-gray-500 dark:text-gray-400">{t("averageRating")}</div>
                  <div className="font-semibold">{scorecard.averageRating ?? "—"}</div>
                </div>
                <div>
                  <div className="text-gray-500 dark:text-gray-400">{t("onTimePercent")}</div>
                  <div className="font-semibold">{scorecard.onTimePercent !== null ? `${scorecard.onTimePercent}%` : "—"}</div>
                </div>
                <div>
                  <div className="text-gray-500 dark:text-gray-400">{t("wouldHireAgainPercent")}</div>
                  <div className="font-semibold">{scorecard.wouldHireAgainPercent !== null ? `${scorecard.wouldHireAgainPercent}%` : "—"}</div>
                </div>
                <div>
                  <div className="text-gray-500 dark:text-gray-400">{t("reviewCount")}</div>
                  <div className="font-semibold">{scorecard.reviewCount}</div>
                </div>
              </div>
            )}

            {reviews && reviews.length > 0 && (
              <ul className="mb-3 flex flex-col gap-1.5">
                {reviews.map((r) => (
                  <li key={r.id} className="text-xs text-gray-600 dark:text-gray-300">
                    <span className="font-medium">{"★".repeat(r.rating)}</span> — {r.reviewedByName},{" "}
                    {formatDate(new Date(r.createdAt))}
                    {r.comments && <span className="text-gray-500 dark:text-gray-400"> · {r.comments}</span>}
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={addReview} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
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
              <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                {t("onTime")}
                <select className="input w-auto" value={reviewForm.onTime} onChange={(e) => setReviewForm((f) => ({ ...f, onTime: e.target.value }))}>
                  <option value="">—</option>
                  <option value="yes">{tc("yes")}</option>
                  <option value="no">{tc("no")}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
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
              <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                {t("safetyIncidents")}
                <input
                  type="number"
                  min="0"
                  className="input w-20"
                  value={reviewForm.safetyIncidents}
                  onChange={(e) => setReviewForm((f) => ({ ...f, safetyIncidents: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
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

          <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("datevSettings")}</h3>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("datevKreditorNumberHint")}</p>
            <form onSubmit={saveTaxProfile} className="flex flex-col gap-2">
              <input
                placeholder={t("datevKreditorNumber")}
                className="input"
                value={taxForm.datevKreditorNumber}
                onChange={(e) => setTaxForm((f) => ({ ...f, datevKreditorNumber: e.target.value.replace(/\D/g, "") }))}
              />
              <button type="submit" disabled={busy} className="btn-secondary self-start px-2.5 py-1 text-xs">
                {tc("save")}
              </button>
            </form>
          </div>

          {isUsCompany && (
            <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("taxProfile")}</h3>
              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("taxProfileHint")}</p>
              <form onSubmit={saveTaxProfile} className="flex flex-col gap-2">
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

              <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("payments")}</h3>
              {payments === null ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">{tc("loading")}</p>
              ) : payments.length === 0 ? (
                <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">{t("noPayments")}</p>
              ) : (
                <ul className="mb-2 flex flex-col gap-1">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 dark:text-gray-400">
                        {formatDate(new Date(p.paidAt))}
                        {p.note && ` · ${p.note}`}
                      </span>
                      <span className="font-medium">{p.amount}</span>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={addPayment} className="flex flex-wrap items-end gap-2">
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
}
