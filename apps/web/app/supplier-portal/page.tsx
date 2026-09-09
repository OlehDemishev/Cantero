"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getSupplierPortalToken, supplierPortalApiFetch, clearSupplierPortalToken } from "@/lib/supplier-portal-api-client";
import { formatDate } from "@/lib/format-date";

interface Me {
  name: string;
  companyName: string;
  currency: string;
}
type PurchaseOrderStatus = "draft" | "ordered" | "received";
interface POLine {
  id: string;
  quantity: string;
  unitPrice: string;
  materialCatalogItem: { name: string; unit: string };
}
interface PurchaseOrder {
  id: string;
  status: PurchaseOrderStatus;
  expectedDate: string | null;
  acknowledgedAt: string | null;
  supplierEta: string | null;
  supplierNote: string | null;
  lines: POLine[];
}

const STATUS_STYLES: Record<PurchaseOrderStatus, string> = {
  draft: "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400",
  ordered: "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500",
  received: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
};

export default function SupplierPortalDashboardPage() {
  const t = useTranslations("supplierPortal");
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null);
  const [ackForms, setAckForms] = useState<Record<string, { eta: string; note: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadOrders() {
    supplierPortalApiFetch<PurchaseOrder[]>("/supplier-portal/purchase-orders").then(setOrders);
  }

  useEffect(() => {
    if (!getSupplierPortalToken()) {
      router.replace("/supplier-portal/login");
      return;
    }
    supplierPortalApiFetch<Me>("/supplier-portal/me").then(setMe);
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function logout() {
    clearSupplierPortalToken();
    router.replace("/supplier-portal/login");
  }

  async function acknowledge(orderId: string) {
    const form = ackForms[orderId] ?? { eta: "", note: "" };
    setBusyId(orderId);
    setError(null);
    try {
      await supplierPortalApiFetch(`/supplier-portal/purchase-orders/${orderId}/acknowledge`, {
        method: "POST",
        body: JSON.stringify({
          eta: form.eta ? new Date(form.eta).toISOString() : undefined,
          note: form.note || undefined,
        }),
      });
      loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("verifyError"));
    } finally {
      setBusyId(null);
    }
  }

  if (!me) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("loading")}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-700 px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">
              C
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{me.companyName}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("welcome", { name: me.name })}</p>
            </div>
          </div>
          <button onClick={logout} className="btn-secondary px-3 py-1.5 text-xs">
            {t("logout")}
          </button>
        </div>
        {error && <p className="mb-4 rounded-md bg-red-50 dark:bg-red-500/15 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}

        <section className="card">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("purchaseOrders")}</h2>
          {!orders || orders.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("noPurchaseOrders")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {orders.map((po) => {
                const form = ackForms[po.id] ?? { eta: "", note: "" };
                return (
                  <li key={po.id} className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-gray-50">
                        {t("orderNumber", { id: po.id.slice(0, 8) })}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[po.status]}`}>
                        {t(po.status)}
                      </span>
                    </div>
                    <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {po.lines.map((l) => (
                        <li key={l.id}>
                          {l.materialCatalogItem.name} × {l.quantity} {l.materialCatalogItem.unit} @ {l.unitPrice} {me.currency}
                        </li>
                      ))}
                    </ul>
                    {po.expectedDate && (
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        {t("expectedDate", { date: formatDate(new Date(po.expectedDate)) })}
                      </p>
                    )}

                    {po.acknowledgedAt ? (
                      <p className="mt-2 text-xs text-success-700 dark:text-success-500">
                        {t("acknowledged", { date: formatDate(new Date(po.acknowledgedAt)) })}
                        {po.supplierEta && (
                          <span className="block">{t("yourEta", { date: formatDate(new Date(po.supplierEta)) })}</span>
                        )}
                        {po.supplierNote && <span className="block text-gray-500 dark:text-gray-400">{po.supplierNote}</span>}
                      </p>
                    ) : po.status !== "draft" ? (
                      <div className="mt-2 flex flex-col gap-1.5 border-t border-gray-100 dark:border-gray-700 pt-2">
                        <div className="flex gap-2">
                          <input
                            type="date"
                            className="input"
                            value={form.eta}
                            onChange={(e) => setAckForms((f) => ({ ...f, [po.id]: { ...form, eta: e.target.value } }))}
                          />
                          <input
                            className="input flex-1"
                            placeholder={t("notePlaceholder")}
                            value={form.note}
                            onChange={(e) => setAckForms((f) => ({ ...f, [po.id]: { ...form, note: e.target.value } }))}
                          />
                        </div>
                        <button
                          onClick={() => acknowledge(po.id)}
                          disabled={busyId === po.id}
                          className="btn-primary w-fit px-3 py-1 text-xs"
                        >
                          {t("acknowledge")}
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
