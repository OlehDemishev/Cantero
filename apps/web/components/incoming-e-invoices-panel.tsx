"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUpload, downloadBlob } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatDate } from "@/lib/format-date";

interface Supplier {
  id: string;
  name: string;
}
interface IncomingEInvoiceLine {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  taxRatePercent: string | null;
}
interface IncomingEInvoice {
  id: string;
  format: "xrechnung_ubl" | "xrechnung_cii" | "zugferd" | "peppol_ubl";
  status: "pending_review" | "matched" | "converted" | "rejected";
  rawFileName: string;
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string | null;
  sellerName: string | null;
  sellerVatId: string | null;
  sellerStreet: string | null;
  sellerCity: string | null;
  sellerPostalCode: string | null;
  sellerCountryCode: string | null;
  subtotal: string | null;
  taxAmount: string | null;
  total: string | null;
  validationErrors: string[];
  supplierId: string | null;
  supplier: Supplier | null;
  vendorBillId: string | null;
  rejectedReason: string | null;
  createdAt: string;
  lines: IncomingEInvoiceLine[];
}

const STATUS_STYLES: Record<IncomingEInvoice["status"], string> = {
  pending_review: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
  matched: "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400",
  converted: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
  rejected: "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500",
};

export function IncomingEInvoicesPanel() {
  const t = useTranslations("incomingEInvoices");
  const tc = useTranslations("common");
  const { data: me } = useMe();

  const [invoices, setInvoices] = useState<IncomingEInvoice[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [matchDraft, setMatchDraft] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    apiFetch<IncomingEInvoice[]>("/finance/incoming-invoices").then(setInvoices);
  }

  useEffect(() => {
    load();
    apiFetch<Supplier[]>("/materials/suppliers").then(setSuppliers);
  }, []);

  async function upload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      await apiUpload("/finance/incoming-invoices/upload", file);
      load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t("uploadFailed"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function matchSupplier(id: string) {
    const supplierId = matchDraft[id];
    if (!supplierId) return;
    setBusyId(id);
    try {
      await apiFetch(`/finance/incoming-invoices/${id}/match-supplier`, { method: "POST", body: JSON.stringify({ supplierId }) });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function convert(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/finance/incoming-invoices/${id}/convert`, { method: "POST" });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    const reason = window.prompt(t("rejectReasonPrompt"));
    if (!reason) return;
    setBusyId(id);
    try {
      await apiFetch(`/finance/incoming-invoices/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function downloadRaw(inv: IncomingEInvoice) {
    const blob = await apiFetch<Blob>(`/finance/incoming-invoices/${inv.id}/raw-file`);
    downloadBlob(blob, inv.rawFileName);
  }

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      <div className="card mb-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-200">{t("uploadLabel")}</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,.pdf,application/xml,text/xml,application/pdf"
            disabled={uploading}
            className="input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
        </label>
        {uploadError && <p className="mt-2 text-xs text-error-600">{uploadError}</p>}
      </div>

      {!invoices ? (
        <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      ) : invoices.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">{t("noInvoices")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {invoices.map((inv) => {
            const expanded = expandedId === inv.id;
            return (
              <li key={inv.id} className="card">
                <button className="flex w-full items-center justify-between text-left" onClick={() => setExpandedId(expanded ? null : inv.id)}>
                  <div>
                    <div className="font-medium">
                      {inv.invoiceNumber ?? inv.rawFileName} · {inv.sellerName ?? t("unknownSeller")}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {t(`format_${inv.format}`)} · {formatDate(new Date(inv.createdAt))}
                      {inv.total ? ` · ${inv.total} ${inv.currency ?? me?.company.currency ?? ""}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {inv.validationErrors.length > 0 && (
                      <span className="rounded-full bg-amber-100 dark:bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-400">
                        {t("validationWarnings", { count: inv.validationErrors.length })}
                      </span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[inv.status]}`}>{t(`status_${inv.status}`)}</span>
                  </div>
                </button>

                {expanded && (
                  <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{t("sellerDetails")}</p>
                        <p>{inv.sellerName}</p>
                        <p>{inv.sellerStreet}</p>
                        <p>
                          {inv.sellerPostalCode} {inv.sellerCity}, {inv.sellerCountryCode}
                        </p>
                        {inv.sellerVatId && <p>{t("vatId")}: {inv.sellerVatId}</p>}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{t("totals")}</p>
                        {inv.dueDate && <p>{t("dueDate")}: {formatDate(new Date(inv.dueDate))}</p>}
                        <p>{t("subtotal")}: {inv.subtotal} {inv.currency}</p>
                        <p>{t("tax")}: {inv.taxAmount} {inv.currency}</p>
                        <p className="font-medium">{t("total")}: {inv.total} {inv.currency}</p>
                      </div>
                    </div>

                    <ul className="mt-3 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
                      {inv.lines.map((l) => (
                        <li key={l.id}>
                          {l.description} × {l.quantity} @ {l.unitPrice} {inv.currency}
                          {l.taxRatePercent ? ` (${l.taxRatePercent}% ${t("tax")})` : ""}
                        </li>
                      ))}
                    </ul>

                    {inv.validationErrors.length > 0 && (
                      <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-400">
                        <p className="font-medium">{t("validationHeading")}</p>
                        <ul className="mt-1 list-disc pl-4">
                          {inv.validationErrors.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {inv.status === "rejected" && inv.rejectedReason && (
                      <p className="mt-3 text-xs text-error-600">{t("rejectedReasonLabel")}: {inv.rejectedReason}</p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button onClick={() => downloadRaw(inv)} className="btn-secondary px-2 py-1 text-xs">
                        {t("downloadOriginal")}
                      </button>

                      {inv.status !== "converted" && inv.status !== "rejected" && (
                        <>
                          <select
                            className="input py-1 text-xs"
                            value={matchDraft[inv.id] ?? inv.supplierId ?? ""}
                            onChange={(e) => setMatchDraft((d) => ({ ...d, [inv.id]: e.target.value }))}
                          >
                            <option value="">{t("selectSupplier")}</option>
                            {suppliers.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => matchSupplier(inv.id)}
                            disabled={busyId === inv.id || !matchDraft[inv.id]}
                            className="btn-secondary px-2 py-1 text-xs"
                          >
                            {t("matchSupplier")}
                          </button>
                        </>
                      )}

                      {inv.status === "matched" && (
                        <button onClick={() => convert(inv.id)} disabled={busyId === inv.id} className="btn-primary px-2 py-1 text-xs">
                          {t("convertToBill")}
                        </button>
                      )}
                      {inv.status !== "converted" && inv.status !== "rejected" && (
                        <button onClick={() => reject(inv.id)} disabled={busyId === inv.id} className="btn-secondary px-2 py-1 text-xs text-error-600">
                          {t("reject")}
                        </button>
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
  );
}
