"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { SUPPLIER_DOCUMENT_TYPES, type ImportResult, type SupplierDocumentType } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { CertificateAttachment } from "@/components/certificate-attachment";
import { MaterialRfqsPanel } from "@/components/material-rfqs-panel";
import { apiFetch, apiUpload } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface Supplier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}
interface Scorecard {
  totalOrders: number;
  receivedOrders: number;
  totalSpend: number;
  onTimeRate: number | null;
  averageDelayDays: number | null;
  reviewCount: number;
  averageRating: number | null;
  wouldReorderPercent: number | null;
  averagePriceVariancePercent: number | null;
}
interface SupplierDocument {
  id: string;
  type: SupplierDocumentType;
  name: string;
  expiresAt: string;
}
interface SupplierReview {
  id: string;
  reviewedByName: string;
  rating: number;
  wouldReorder: boolean | null;
  comments: string | null;
  createdAt: string;
}
interface SupplierPurchaseOrder {
  id: string;
  status: "draft" | "ordered" | "partially_received" | "received";
  createdAt: string;
  lines: { quantity: string; unitPrice: string }[];
}

export default function SuppliersPage() {
  const t = useTranslations("suppliers");
  const tc = useTranslations("common");
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scorecards, setScorecards] = useState<Record<string, Scorecard>>({});
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState<ImportResult | null>(null);
  const [documents, setDocuments] = useState<SupplierDocument[] | null>(null);
  const [reviews, setReviews] = useState<SupplierReview[] | null>(null);
  const [docForm, setDocForm] = useState({ type: "general_liability_insurance" as SupplierDocumentType, name: "", expiresAt: "" });
  const [reviewForm, setReviewForm] = useState({ rating: "5", wouldReorder: "", comments: "" });
  const [detailBusy, setDetailBusy] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<SupplierPurchaseOrder[] | null>(null);

  function loadDetail(id: string) {
    apiFetch<SupplierDocument[]>(`/materials/suppliers/${id}/documents`).then(setDocuments);
    apiFetch<SupplierReview[]>(`/materials/suppliers/${id}/reviews`).then(setReviews);
    apiFetch<SupplierPurchaseOrder[]>(`/materials/purchase-orders?supplierId=${id}`).then(setPurchaseOrders);
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDocuments(null);
      setReviews(null);
      setPurchaseOrders(null);
      return;
    }
    setExpandedId(id);
    setDocuments(null);
    setReviews(null);
    setPurchaseOrders(null);
    if (!scorecards[id]) {
      apiFetch<Scorecard>(`/materials/suppliers/${id}/scorecard`).then((s) => setScorecards((prev) => ({ ...prev, [id]: s })));
    }
    loadDetail(id);
  }

  async function addDocument(e: React.FormEvent, supplierId: string) {
    e.preventDefault();
    if (!docForm.name || !docForm.expiresAt) return;
    setDetailBusy(true);
    try {
      await apiFetch(`/materials/suppliers/${supplierId}/documents`, {
        method: "POST",
        body: JSON.stringify({ type: docForm.type, name: docForm.name, expiresAt: new Date(docForm.expiresAt).toISOString() }),
      });
      setDocForm({ type: "general_liability_insurance", name: "", expiresAt: "" });
      loadDetail(supplierId);
    } finally {
      setDetailBusy(false);
    }
  }

  async function removeDocument(supplierId: string, documentId: string) {
    if (!window.confirm(t("confirmDeleteDocument"))) return;
    await apiFetch(`/materials/suppliers/${supplierId}/documents/${documentId}`, { method: "DELETE" });
    loadDetail(supplierId);
  }

  async function addReview(e: React.FormEvent, supplierId: string) {
    e.preventDefault();
    setDetailBusy(true);
    try {
      await apiFetch(`/materials/suppliers/${supplierId}/reviews`, {
        method: "POST",
        body: JSON.stringify({
          rating: Number(reviewForm.rating),
          wouldReorder: reviewForm.wouldReorder ? reviewForm.wouldReorder === "yes" : undefined,
          comments: reviewForm.comments || undefined,
        }),
      });
      setReviewForm({ rating: "5", wouldReorder: "", comments: "" });
      loadDetail(supplierId);
      setScorecards((prev) => {
        const next = { ...prev };
        delete next[supplierId];
        return next;
      });
      apiFetch<Scorecard>(`/materials/suppliers/${supplierId}/scorecard`).then((s) => setScorecards((prev) => ({ ...prev, [supplierId]: s })));
    } finally {
      setDetailBusy(false);
    }
  }

  function load() {
    apiFetch<Supplier[]>("/materials/suppliers").then(setSuppliers);
  }

  useEffect(load, []);

  async function syncCatalog(e: React.ChangeEvent<HTMLInputElement>, supplierId: string) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSyncBusy(true);
    setSyncResult(null);
    try {
      const result = await apiUpload<ImportResult>(`/materials/suppliers/${supplierId}/catalog-sync`, file);
      setSyncResult(result);
    } finally {
      setSyncBusy(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/materials/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          email: form.email || undefined,
          phone: form.phone || undefined,
        }),
      });
      setForm({ name: "", email: "", phone: "" });
      load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("newSupplier")}</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              required
              placeholder={tc("name")}
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              placeholder={tc("email")}
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <input
              placeholder={tc("phone")}
              className="input"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <button type="submit" disabled={submitting} className="btn-primary">
              {tc("create")}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2">
          {!suppliers ? (
            <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {suppliers.map((s) => {
                const card = scorecards[s.id];
                return (
                  <li key={s.id} className="card cursor-pointer" onClick={() => toggleExpand(s.id)}>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{s.email ?? s.phone ?? "—"}</div>
                    {expandedId === s.id && (
                      <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3" onClick={(e) => e.stopPropagation()}>
                        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                          {!card ? (
                            <span className="text-gray-400 dark:text-gray-500">{tc("loading")}</span>
                          ) : (
                            <>
                              <div>
                                <div className="text-gray-400 dark:text-gray-500">{t("totalOrders")}</div>
                                <div className="font-medium">{card.totalOrders}</div>
                              </div>
                              <div>
                                <div className="text-gray-400 dark:text-gray-500">{t("onTimeRate")}</div>
                                <div className="font-medium">{card.onTimeRate !== null ? `${Math.round(card.onTimeRate * 100)}%` : "—"}</div>
                              </div>
                              <div>
                                <div className="text-gray-400 dark:text-gray-500">{t("averageDelay")}</div>
                                <div className="font-medium">{card.averageDelayDays !== null ? `${card.averageDelayDays.toFixed(1)}d` : "—"}</div>
                              </div>
                              <div>
                                <div className="text-gray-400 dark:text-gray-500">{t("totalSpend")}</div>
                                <div className="font-medium">{card.totalSpend}</div>
                              </div>
                              <div>
                                <div className="text-gray-400 dark:text-gray-500">{t("averageRating")}</div>
                                <div className="font-medium">{card.averageRating ?? "—"}</div>
                              </div>
                              <div>
                                <div className="text-gray-400 dark:text-gray-500">{t("wouldReorderPercent")}</div>
                                <div className="font-medium">{card.wouldReorderPercent !== null ? `${card.wouldReorderPercent}%` : "—"}</div>
                              </div>
                              <div>
                                <div className="text-gray-400 dark:text-gray-500">{t("priceVariance")}</div>
                                <div
                                  className={`font-medium ${card.averagePriceVariancePercent !== null && card.averagePriceVariancePercent > 0 ? "text-error-600" : card.averagePriceVariancePercent !== null && card.averagePriceVariancePercent < 0 ? "text-success-700 dark:text-success-500" : ""}`}
                                >
                                  {card.averagePriceVariancePercent !== null ? `${card.averagePriceVariancePercent > 0 ? "+" : ""}${card.averagePriceVariancePercent}%` : "—"}
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                          <div className="mb-1.5 flex items-center justify-between">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("purchaseOrders")}</h3>
                            <Link href="/purchase-orders" className="text-xs text-brand-700 dark:text-brand-400 hover:underline">
                              {t("viewAllPurchaseOrders")}
                            </Link>
                          </div>
                          {purchaseOrders === null ? (
                            <p className="text-xs text-gray-400 dark:text-gray-500">{tc("loading")}</p>
                          ) : purchaseOrders.length === 0 ? (
                            <p className="text-xs text-gray-400 dark:text-gray-500">{t("noPurchaseOrdersYet")}</p>
                          ) : (
                            <ul className="flex flex-col gap-1">
                              {purchaseOrders.map((po) => {
                                const total = po.lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitPrice), 0);
                                return (
                                  <li key={po.id} className="flex items-center justify-between text-xs">
                                    <span className="text-gray-500 dark:text-gray-400">{formatDate(new Date(po.createdAt))}</span>
                                    <span>{t(po.status)}</span>
                                    <span className="font-medium">{total.toFixed(2)}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>

                        <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("coiDocuments")}</h3>
                          {documents === null ? (
                            <p className="text-xs text-gray-400 dark:text-gray-500">{tc("loading")}</p>
                          ) : documents.length === 0 ? (
                            <p className="text-xs text-gray-400 dark:text-gray-500">{t("noCoiDocuments")}</p>
                          ) : (
                            <ul className="mb-2 flex flex-col gap-1.5">
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
                                      <CertificateAttachment param="supplierDocumentId" entityId={doc.id} />
                                      <button onClick={() => removeDocument(s.id, doc.id)} className="text-gray-400 dark:text-gray-500 hover:text-error-600">
                                        ×
                                      </button>
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          <form onSubmit={(e) => addDocument(e, s.id)} className="flex flex-wrap items-end gap-2">
                            <select
                              className="input w-auto"
                              value={docForm.type}
                              onChange={(e) => setDocForm((f) => ({ ...f, type: e.target.value as SupplierDocumentType }))}
                            >
                              {SUPPLIER_DOCUMENT_TYPES.map((ty) => (
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
                            <button type="submit" disabled={detailBusy} className="btn-secondary px-2.5 py-1 text-xs">
                              {t("addDocument")}
                            </button>
                          </form>
                        </div>

                        <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("reviews")}</h3>
                          {reviews && reviews.length > 0 && (
                            <ul className="mb-2 flex flex-col gap-1.5">
                              {reviews.map((r) => (
                                <li key={r.id} className="text-xs text-gray-600 dark:text-gray-300">
                                  <span className="font-medium">{"★".repeat(r.rating)}</span> — {r.reviewedByName},{" "}
                                  {formatDate(new Date(r.createdAt))}
                                  {r.comments && <span className="text-gray-500 dark:text-gray-400"> · {r.comments}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                          <form onSubmit={(e) => addReview(e, s.id)} className="flex flex-wrap items-end gap-2">
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
                              {t("wouldReorder")}
                              <select
                                className="input w-auto"
                                value={reviewForm.wouldReorder}
                                onChange={(e) => setReviewForm((f) => ({ ...f, wouldReorder: e.target.value }))}
                              >
                                <option value="">—</option>
                                <option value="yes">{tc("yes")}</option>
                                <option value="no">{tc("no")}</option>
                              </select>
                            </label>
                            <input
                              placeholder={t("reviewCommentsPlaceholder")}
                              className="input"
                              value={reviewForm.comments}
                              onChange={(e) => setReviewForm((f) => ({ ...f, comments: e.target.value }))}
                            />
                            <button type="submit" disabled={detailBusy} className="btn-secondary px-2.5 py-1 text-xs">
                              {t("addReview")}
                            </button>
                          </form>
                        </div>

                        <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("catalogSync")}</p>
                          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("catalogSyncHint")}</p>
                          <label className="btn-secondary inline-block cursor-pointer px-2.5 py-1 text-xs">
                            {syncBusy ? tc("loading") : t("uploadCatalogCsv")}
                            <input type="file" accept=".csv" className="hidden" disabled={syncBusy} onChange={(e) => syncCatalog(e, s.id)} />
                          </label>
                          {syncResult && (
                            <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                              {t("catalogSyncResult", { updated: syncResult.created, skipped: syncResult.skipped })}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <MaterialRfqsPanel />
    </AuthenticatedShell>
  );
}
