"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { SageApExportPanel } from "@/components/sage-ap-export-panel";
import { useMe } from "@/lib/use-me";
import { formatDate } from "@/lib/format-date";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatCurrency } from "@/lib/format-currency";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/use-api";
import { Badge } from "@/components/ui/badge";

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
  status: "draft" | "approved" | "paid" | "void";
  voidReason: string | null;
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
  const confirm = useConfirm();
  const tc = useTranslations("common");
  const { data: me } = useMe();

  const { data: bills = null, error: billsError, reload: reloadBillList } = useApi<VendorBill[]>("/materials/vendor-bills");
  const { data: aging = null, reload: reloadAging } = useApi<ApAgingReport>("/materials/vendor-bills/aging-report");
  const { data: disbursementCalendar = null, reload: reloadDisbursementCalendar } = useApi<DisbursementCalendar>(
    "/materials/vendor-bills/disbursement-calendar",
  );
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
    void reloadBillList();
    void reloadAging();
    void reloadDisbursementCalendar();
  }

  useEffect(() => {
    apiFetch<Supplier[]>("/materials/suppliers").then((s) => {
      setSuppliers(s);
      if (s[0]) setBillSupplierId(s[0].id);
    }).catch(notifyApiError);
    apiFetch<PurchaseOrderSummary[]>("/materials/purchase-orders").then(setOrders).catch(notifyApiError);
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

  async function voidBill(billId: string) {
    await confirm({
      title: t("voidBill"),
      tone: "danger",
      verb: "void",
      reason: { label: t("voidBillReasonPrompt"), required: true },
      action: async (reason) => {
        await apiFetch(`/materials/vendor-bills/${billId}/void`, { method: "POST", body: JSON.stringify({ reason }) });
        loadBills();
      },
    });
  }

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("vendorBillsTitle")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("vendorBillsHint")}</p>

      <SageApExportPanel />

      {aging && aging.grandTotal > 0 && (
        <div className="card mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("apAgingTitle")}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(["current", "days1to30", "days31to60", "days61to90", "over90"] as const).map((bucket) => (
              <div key={bucket}>
                <div className="text-xs text-fg-subtle">{t(`agingBucket_${bucket}`)}</div>
                <div className="mt-1 text-sm font-semibold text-fg">
                  {formatCurrency(aging.totalsByBucket[bucket] ?? 0, me?.company.currency)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg-muted">{t("newVendorBill")}</h3>
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
              <label className="flex flex-col gap-1 text-xs text-fg-subtle">
                {t("dueDate")}
                <input type="date" className="input mt-1" value={billDueDate} onChange={(e) => setBillDueDate(e.target.value)} />
              </label>

              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-fg-subtle">{t("billLines")}</span>
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
            billsError ? <ErrorState error={billsError} onRetry={reloadBillList} compact /> : <Skeleton lines={3} />
          ) : bills.length === 0 ? (
            <p className="text-fg-subtle">{t("noVendorBills")}</p>
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
                        <Badge tone={bill.match.status === "variance" ? "danger" : "success"}>
                          {t(`matchStatus_${bill.match.status}`)}
                        </Badge>
                      )}
                      <Badge tone={bill.status === "paid" ? "success" : bill.status === "approved" ? "brand" : bill.status === "void" ? "danger" : "neutral"}>
                        {t(`billStatus_${bill.status}`)}
                      </Badge>
                    </div>
                  </div>
                  <ul className="mt-2 text-sm text-fg-subtle">
                    {bill.lines.map((l) => (
                      <li key={l.id}>
                        {l.description} × {l.quantity} @ {formatCurrency(l.unitPrice, me?.company.currency, { maximumFractionDigits: 4 })}
                      </li>
                    ))}
                  </ul>
                  {bill.dueDate && <p className="mt-1 text-xs text-fg-subtle">{t("dueDate")}: {formatDate(new Date(bill.dueDate))}</p>}
                  {bill.scheduledPaymentDate && (
                    <p className="mt-1 text-xs text-fg-subtle">{t("scheduledPaymentDate")}: {formatDate(new Date(bill.scheduledPaymentDate))}</p>
                  )}
                  {bill.status === "void" && bill.voidReason && <p className="mt-1 text-xs text-danger-fg">{t("voidReasonLabel")}: {bill.voidReason}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {bill.status === "draft" && (
                      <button onClick={() => approveBill(bill.id)} className="btn-secondary px-2 py-1 text-xs">
                        {t("approveBill")}
                      </button>
                    )}
                    {(bill.status === "approved" || bill.status === "paid") && (
                      <button onClick={() => voidBill(bill.id)} className="btn-secondary px-2 py-1 text-xs text-danger-fg">
                        {t("voidBill")}
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
            <h3 className="mb-1 text-sm font-semibold text-fg-muted">{t("disbursementCalendar")}</h3>
            <p className="mb-3 text-xs text-fg-subtle">{t("disbursementCalendarHint")}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                    <th className="py-1">{t("weekOf")}</th>
                    <th className="text-right">{t("totalDue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {disbursementCalendar.buckets.map((b) => (
                    <tr key={b.weekStart} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="py-1">{formatDate(new Date(b.weekStart))}</td>
                      <td className="text-right tabular-nums">
                        {formatCurrency(b.total, me?.company.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {disbursementCalendar.unscheduledTotal > 0 && (
              <p className="mt-2 text-xs text-fg-subtle">
                {t("unscheduledTotal", { amount: formatCurrency(disbursementCalendar.unscheduledTotal, me?.company.currency) })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
