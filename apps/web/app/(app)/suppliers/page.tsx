"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { SUPPLIER_DOCUMENT_TYPES, type ImportResult, type SupplierDocumentType } from "@cantero/shared";
import { CertificateAttachment } from "@/components/certificate-attachment";
import { SupplierAccountingFields } from "@/components/supplier-accounting-fields";
import { MaterialRfqsPanel } from "@/components/material-rfqs-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { CloseIcon, SuppliersIcon } from "@/components/nav-icons";
import { apiFetch, apiUpload, notifyApiError } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format-date";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatNumber } from "@/lib/format-currency";

interface Supplier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  vatId: string | null;
  sageVendorId: string | null;
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
  const confirm = useConfirm();
  const tc = useTranslations("common");
  const { data: suppliers = null, reload: reloadSuppliers, error: suppliersError } = useApi<Supplier[]>("/materials/suppliers");
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scorecards, setScorecards] = useState<Record<string, Scorecard>>({});
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState<ImportResult | null>(null);
  // The open supplier's documents, reviews and orders.
  const {
    data: documents = null,
    error: documentsError,
    reload: reloadDocuments,
  } = useApi<SupplierDocument[]>(expandedId ? `/materials/suppliers/${expandedId}/documents` : null);
  const { data: reviews = null, reload: reloadReviews } = useApi<SupplierReview[]>(expandedId ? `/materials/suppliers/${expandedId}/reviews` : null);
  const [docForm, setDocForm] = useState({ type: "general_liability_insurance" as SupplierDocumentType, name: "", expiresAt: "" });
  const [reviewForm, setReviewForm] = useState({ rating: "5", wouldReorder: "", comments: "" });
  const [detailBusy, setDetailBusy] = useState(false);
  const {
    data: purchaseOrders = null,
    error: purchaseOrdersError,
    reload: reloadPurchaseOrders,
  } = useApi<SupplierPurchaseOrder[]>(expandedId ? `/materials/purchase-orders?supplierId=${expandedId}` : null);

  /** After a change to the open supplier's documents or reviews. */
  function loadDetail() {
    void reloadDocuments();
    void reloadReviews();
    void reloadPurchaseOrders();
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!scorecards[id]) {
      apiFetch<Scorecard>(`/materials/suppliers/${id}/scorecard`).then((s) => setScorecards((prev) => ({ ...prev, [id]: s }))).catch(notifyApiError);
    }
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
      loadDetail();
    } finally {
      setDetailBusy(false);
    }
  }

  async function removeDocument(supplierId: string, documentId: string) {
    if (!(await confirm({ message: t("confirmDeleteDocument"), tone: "danger", verb: "delete" }))) return;
    await apiFetch(`/materials/suppliers/${supplierId}/documents/${documentId}`, { method: "DELETE" });
    loadDetail();
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
      loadDetail();
      setScorecards((prev) => {
        const next = { ...prev };
        delete next[supplierId];
        return next;
      });
      apiFetch<Scorecard>(`/materials/suppliers/${supplierId}/scorecard`).then((s) => setScorecards((prev) => ({ ...prev, [supplierId]: s }))).catch(notifyApiError);
    } finally {
      setDetailBusy(false);
    }
  }

  function load() {
    void reloadSuppliers();
  }

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
      setShowCreateForm(false);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {!showCreateForm && (
          <button type="button" onClick={() => setShowCreateForm(true)} className="btn-primary">
            {t("newSupplier")}
          </button>
        )}
      </div>

      {showCreateForm && (
        <div className="mt-6 card max-w-md">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg-muted">{t("newSupplier")}</h2>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              aria-label={tc("cancel")}
              className="text-fg-subtle hover:text-gray-600 dark:hover:text-gray-300"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              required
              autoFocus
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
      )}

      <div className="mt-6">
        {!suppliers ? (
          suppliersError ? <ErrorState error={suppliersError} onRetry={reloadSuppliers} compact /> : <Skeleton lines={3} />
        ) : suppliers.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={SuppliersIcon}
              title={t("emptyTitle")}
              message={t("empty")}
              cta={{ label: t("newSupplier"), onClick: () => setShowCreateForm(true) }}
            />
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
              {suppliers.map((s) => {
                const card = scorecards[s.id];
                return (
                  <li key={s.id} className="card cursor-pointer" onClick={() => toggleExpand(s.id)}>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-sm text-fg-subtle">{s.email ?? s.phone ?? "—"}</div>
                    {expandedId === s.id && (
                      <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3" onClick={(e) => e.stopPropagation()}>
                        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                          {!card ? (
                            <span className="text-fg-subtle">{tc("loading")}</span>
                          ) : (
                            <>
                              <div>
                                <div className="text-fg-subtle">{t("totalOrders")}</div>
                                <div className="font-medium">{card.totalOrders}</div>
                              </div>
                              <div>
                                <div className="text-fg-subtle">{t("onTimeRate")}</div>
                                <div className="font-medium">{card.onTimeRate !== null ? `${Math.round(card.onTimeRate * 100)}%` : "—"}</div>
                              </div>
                              <div>
                                <div className="text-fg-subtle">{t("averageDelay")}</div>
                                <div className="font-medium">{card.averageDelayDays !== null ? `${formatNumber(card.averageDelayDays, { fractionDigits: 1 })}d` : "—"}</div>
                              </div>
                              <div>
                                <div className="text-fg-subtle">{t("totalSpend")}</div>
                                <div className="font-medium">{card.totalSpend}</div>
                              </div>
                              <div>
                                <div className="text-fg-subtle">{t("averageRating")}</div>
                                <div className="font-medium">{card.averageRating ?? "—"}</div>
                              </div>
                              <div>
                                <div className="text-fg-subtle">{t("wouldReorderPercent")}</div>
                                <div className="font-medium">{card.wouldReorderPercent !== null ? `${card.wouldReorderPercent}%` : "—"}</div>
                              </div>
                              <div>
                                <div className="text-fg-subtle">{t("priceVariance")}</div>
                                <div
                                  className={`font-medium ${card.averagePriceVariancePercent !== null && card.averagePriceVariancePercent > 0 ? "text-danger-fg" : card.averagePriceVariancePercent !== null && card.averagePriceVariancePercent < 0 ? "text-success-fg" : ""}`}
                                >
                                  {card.averagePriceVariancePercent !== null ? `${card.averagePriceVariancePercent > 0 ? "+" : ""}${card.averagePriceVariancePercent}%` : "—"}
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        <SupplierAccountingFields key={`${s.id}-${s.vatId}-${s.sageVendorId}`} supplier={s} onSaved={load} />

                        <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                          <div className="mb-1.5 flex items-center justify-between">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("purchaseOrders")}</h3>
                            <Link href="/purchase-orders" className="text-xs text-brand-700 dark:text-brand-400 hover:underline">
                              {t("viewAllPurchaseOrders")}
                            </Link>
                          </div>
                          {purchaseOrders === null ? (
                            purchaseOrdersError ? (
                              <ErrorState error={purchaseOrdersError} onRetry={reloadPurchaseOrders} compact />
                            ) : (
                              <Skeleton lines={2} />
                            )
                          ) : purchaseOrders.length === 0 ? (
                            <p className="text-xs text-fg-subtle">{t("noPurchaseOrdersYet")}</p>
                          ) : (
                            <ul className="flex flex-col gap-1">
                              {purchaseOrders.map((po) => {
                                const total = po.lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitPrice), 0);
                                return (
                                  <li key={po.id} className="flex items-center justify-between text-xs">
                                    <span className="text-fg-subtle">{formatDate(new Date(po.createdAt))}</span>
                                    <span>{t(po.status)}</span>
                                    <span className="font-medium">{formatNumber(total, { fractionDigits: 2 })}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>

                        <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("coiDocuments")}</h3>
                          {documents === null ? (
                            documentsError ? <ErrorState error={documentsError} onRetry={reloadDocuments} compact /> : <Skeleton lines={2} />
                          ) : documents.length === 0 ? (
                            <p className="text-xs text-fg-subtle">{t("noCoiDocuments")}</p>
                          ) : (
                            <ul className="mb-2 flex flex-col gap-1.5">
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
                                      <CertificateAttachment param="supplierDocumentId" entityId={doc.id} />
                                      <button onClick={() => removeDocument(s.id, doc.id)} className="text-fg-subtle hover:text-danger-fg">
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
                          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("reviews")}</h3>
                          {reviews && reviews.length > 0 && (
                            <ul className="mb-2 flex flex-col gap-1.5">
                              {reviews.map((r) => (
                                <li key={r.id} className="text-xs text-gray-600 dark:text-gray-300">
                                  <span className="font-medium">{"★".repeat(r.rating)}</span> — {r.reviewedByName},{" "}
                                  {formatDate(new Date(r.createdAt))}
                                  {r.comments && <span className="text-fg-subtle"> · {r.comments}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                          <form onSubmit={(e) => addReview(e, s.id)} className="flex flex-wrap items-end gap-2">
                            <label className="flex flex-col gap-1 text-xs text-fg-subtle">
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
                            <label className="flex flex-col gap-1 text-xs text-fg-subtle">
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
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("catalogSync")}</p>
                          <p className="mb-2 text-xs text-fg-subtle">{t("catalogSyncHint")}</p>
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

      <MaterialRfqsPanel />
    </>
  );
}
