"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatDate } from "@/lib/format-date";

interface Supplier {
  id: string;
  name: string;
}
interface MaterialCatalogItem {
  id: string;
  code: string;
  name: string;
}
interface PurchaseOrderSummary {
  id: string;
  status: "draft" | "ordered" | "received" | "partially_received";
  supplier: Supplier;
}
interface VendorBillLine {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  materialCatalogItem: MaterialCatalogItem | null;
}
interface MatchLineResult {
  materialCatalogItemId: string;
  orderedQuantity: number;
  orderedUnitPrice: number;
  billedQuantity: number;
  billedUnitPrice: number;
  quantityVariance: number;
  priceVariance: number;
}
interface VendorBillMatch {
  status: "no_po" | "matched" | "variance";
  lines: MatchLineResult[];
}
interface VendorBill {
  id: string;
  billNumber: string;
  billDate: string;
  dueDate: string | null;
  scheduledPaymentDate: string | null;
  status: "draft" | "approved" | "paid";
  supplier: Supplier;
  purchaseOrder: { id: string } | null;
  lines: VendorBillLine[];
  match: VendorBillMatch;
}
interface DisbursementBucket {
  weekStart: string;
  weekEnd: string;
  total: number;
  bills: { id: string; billNumber: string; supplierName: string; amount: number }[];
}
interface DisbursementCalendar {
  buckets: DisbursementBucket[];
  unscheduledTotal: number;
  unscheduledBills: { id: string; billNumber: string; supplierName: string; amount: number }[];
}
interface DraftBillLine {
  description: string;
  quantity: string;
  unitPrice: string;
}
interface ApAgingBill {
  id: string;
  billNumber: string;
  supplierName: string;
  amount: number;
  daysPastDue: number;
  bucket: "current" | "days1to30" | "days31to60" | "days61to90" | "over90";
}
interface ApAgingReport {
  bills: ApAgingBill[];
  totalsByBucket: Record<string, number>;
  grandTotal: number;
}

export function VendorBillsPanel() {
  const t = useTranslations("purchaseOrders");
  const tc = useTranslations("common");
  const { data: me } = useMe();

  const [bills, setBills] = useState<VendorBill[] | null>(null);
  const [aging, setAging] = useState<ApAgingReport | null>(null);
  const [disbursementCalendar, setDisbursementCalendar] = useState<DisbursementCalendar | null>(null);
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>({});
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrderSummary[]>([]);
  const [addingBill, setAddingBill] = useState(false);
  const [billSupplierId, setBillSupplierId] = useState("");
  const [billPurchaseOrderId, setBillPurchaseOrderId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [billDueDate, setBillDueDate] = useState("");
  const [billLines, setBillLines] = useState<DraftBillLine[]>([]);
  const [billSubmitting, setBillSubmitting] = useState(false);

  function loadBills() {
    apiFetch<VendorBill[]>("/materials/vendor-bills").then(setBills);
    apiFetch<ApAgingReport>("/materials/vendor-bills/aging-report").then(setAging);
    apiFetch<DisbursementCalendar>("/materials/vendor-bills/disbursement-calendar").then(setDisbursementCalendar);
  }

  useEffect(() => {
    loadBills();
    apiFetch<Supplier[]>("/materials/suppliers").then((s) => {
      setSuppliers(s);
      if (s[0]) setBillSupplierId(s[0].id);
    });
    apiFetch<PurchaseOrderSummary[]>("/materials/purchase-orders").then(setOrders);
  }, []);

  function addBillLine() {
    setBillLines((l) => [...l, { description: "", quantity: "1", unitPrice: "0" }]);
  }

  async function submitBill(e: React.FormEvent) {
    e.preventDefault();
    if (!billSupplierId || !billNumber.trim() || billLines.length === 0) return;
    setBillSubmitting(true);
    try {
      await apiFetch("/materials/vendor-bills", {
        method: "POST",
        body: JSON.stringify({
          supplierId: billSupplierId,
          purchaseOrderId: billPurchaseOrderId || undefined,
          billNumber: billNumber.trim(),
          dueDate: billDueDate ? new Date(billDueDate).toISOString() : undefined,
          lines: billLines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
        }),
      });
      setBillNumber("");
      setBillDueDate("");
      setBillPurchaseOrderId("");
      setBillLines([]);
      setAddingBill(false);
      loadBills();
    } finally {
      setBillSubmitting(false);
    }
  }

  async function approveBill(billId: string) {
    await apiFetch(`/materials/vendor-bills/${billId}/approve`, { method: "POST" });
    loadBills();
  }

  async function payBill(billId: string) {
    await apiFetch(`/materials/vendor-bills/${billId}/pay`, { method: "POST" });
    loadBills();
  }

  async function schedulePayment(billId: string) {
    const date = scheduleDrafts[billId];
    if (!date) return;
    await apiFetch(`/materials/vendor-bills/${billId}/schedule-payment`, {
      method: "POST",
      body: JSON.stringify({ scheduledPaymentDate: new Date(date).toISOString() }),
    });
    setScheduleDrafts((f) => ({ ...f, [billId]: "" }));
    loadBills();
  }

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("vendorBillsTitle")}</h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("vendorBillsHint")}</p>

      {aging && aging.grandTotal > 0 && (
        <div className="card mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("apAgingTitle")}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(["current", "days1to30", "days31to60", "days61to90", "over90"] as const).map((bucket) => (
              <div key={bucket}>
                <div className="text-xs text-gray-500 dark:text-gray-400">{t(`agingBucket_${bucket}`)}</div>
                <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-50">
                  {aging.totalsByBucket[bucket] ?? 0} {me?.company.currency}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("newVendorBill")}</h3>
            {!addingBill && (
              <button onClick={() => setAddingBill(true)} className="btn-secondary px-2.5 py-1 text-xs">
                {tc("create")}
              </button>
            )}
          </div>
          {addingBill && (
            <form onSubmit={submitBill} className="flex flex-col gap-3">
              <select className="input" value={billSupplierId} onChange={(e) => setBillSupplierId(e.target.value)}>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select className="input" value={billPurchaseOrderId} onChange={(e) => setBillPurchaseOrderId(e.target.value)}>
                <option value="">{t("noLinkedPurchaseOrder")}</option>
                {orders
                  .filter((po) => po.supplier.id === billSupplierId)
                  .map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.id.slice(0, 8)} — {t(po.status)}
                    </option>
                  ))}
              </select>
              <input
                required
                placeholder={t("billNumberPlaceholder")}
                className="input"
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
              />
              <label className="text-xs text-gray-500 dark:text-gray-400">
                {t("dueDate")}
                <input type="date" className="input mt-1" value={billDueDate} onChange={(e) => setBillDueDate(e.target.value)} />
              </label>

              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{t("billLines")}</span>
                <button type="button" onClick={addBillLine} className="btn-secondary px-2 py-1 text-xs">
                  + {t("addLine")}
                </button>
              </div>
              {billLines.map((line, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    required
                    placeholder={t("lineDescriptionPlaceholder")}
                    className="input"
                    value={line.description}
                    onChange={(e) => setBillLines((ls) => ls.map((l, j) => (j === i ? { ...l, description: e.target.value } : l)))}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder={t("quantity")}
                    className="input w-20"
                    value={line.quantity}
                    onChange={(e) => setBillLines((ls) => ls.map((l, j) => (j === i ? { ...l, quantity: e.target.value } : l)))}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={t("unitPrice")}
                    className="input w-20"
                    value={line.unitPrice}
                    onChange={(e) => setBillLines((ls) => ls.map((l, j) => (j === i ? { ...l, unitPrice: e.target.value } : l)))}
                  />
                </div>
              ))}

              <div className="flex gap-2">
                <button type="submit" disabled={billSubmitting || billLines.length === 0} className="btn-primary">
                  {tc("create")}
                </button>
                <button type="button" onClick={() => setAddingBill(false)} className="btn-secondary">
                  {tc("cancel")}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="lg:col-span-2">
          {!bills ? (
            <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
          ) : bills.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">{t("noVendorBills")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {bills.map((bill) => (
                <li key={bill.id} className="card">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {bill.billNumber} · {bill.supplier.name}
                    </div>
                    <div className="flex items-center gap-2">
                      {bill.match.status !== "no_po" && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            bill.match.status === "variance" ? "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500" : "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500"
                          }`}
                        >
                          {t(`matchStatus_${bill.match.status}`)}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          bill.status === "paid"
                            ? "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500"
                            : bill.status === "approved"
                              ? "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                        }`}
                      >
                        {t(`billStatus_${bill.status}`)}
                      </span>
                    </div>
                  </div>
                  <ul className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    {bill.lines.map((l) => (
                      <li key={l.id}>
                        {l.description} × {l.quantity} @ {l.unitPrice} {me?.company.currency}
                      </li>
                    ))}
                  </ul>
                  {bill.dueDate && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t("dueDate")}: {formatDate(new Date(bill.dueDate))}</p>}
                  {bill.scheduledPaymentDate && (
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t("scheduledPaymentDate")}: {formatDate(new Date(bill.scheduledPaymentDate))}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {bill.status === "draft" && (
                      <button onClick={() => approveBill(bill.id)} className="btn-secondary px-2 py-1 text-xs">
                        {t("approveBill")}
                      </button>
                    )}
                    {bill.status === "approved" && (
                      <>
                        <button onClick={() => payBill(bill.id)} className="btn-secondary px-2 py-1 text-xs">
                          {t("markPaid")}
                        </button>
                        <input
                          type="date"
                          className="input py-1 text-xs"
                          value={scheduleDrafts[bill.id] ?? ""}
                          onChange={(e) => setScheduleDrafts((f) => ({ ...f, [bill.id]: e.target.value }))}
                        />
                        <button
                          onClick={() => schedulePayment(bill.id)}
                          disabled={!scheduleDrafts[bill.id]}
                          className="btn-secondary px-2 py-1 text-xs"
                        >
                          {t("schedulePayment")}
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {disbursementCalendar && disbursementCalendar.buckets.some((b) => b.total > 0) && (
          <div className="card mt-4 lg:col-span-3">
            <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("disbursementCalendar")}</h3>
            <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("disbursementCalendarHint")}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                    <th className="py-1">{t("weekOf")}</th>
                    <th className="text-right">{t("totalDue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {disbursementCalendar.buckets.map((b) => (
                    <tr key={b.weekStart} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="py-1">{formatDate(new Date(b.weekStart))}</td>
                      <td className="text-right tabular-nums">
                        {b.total.toFixed(2)} {me?.company.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {disbursementCalendar.unscheduledTotal > 0 && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {t("unscheduledTotal", { amount: disbursementCalendar.unscheduledTotal.toFixed(2), currency: me?.company.currency ?? "" })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
