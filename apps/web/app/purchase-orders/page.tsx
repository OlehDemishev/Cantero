"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface Supplier {
  id: string;
  name: string;
}
interface Warehouse {
  id: string;
  name: string;
}
interface MaterialCatalogItem {
  id: string;
  code: string;
  name: string;
}
interface POLine {
  id: string;
  quantity: string;
  unitPrice: string;
  materialCatalogItem: MaterialCatalogItem;
}
interface PurchaseOrder {
  id: string;
  status: "draft" | "ordered" | "received";
  supplier: Supplier;
  lines: POLine[];
}

interface DraftLine {
  materialCatalogItemId: string;
  quantity: string;
  unitPrice: string;
}

export default function PurchaseOrdersPage() {
  const t = useTranslations("purchaseOrders");
  const tc = useTranslations("common");
  const { data: me } = useMe();

  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [materials, setMaterials] = useState<MaterialCatalogItem[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    apiFetch<PurchaseOrder[]>("/materials/purchase-orders").then(setOrders);
  }

  useEffect(() => {
    load();
    apiFetch<Supplier[]>("/materials/suppliers").then((s) => {
      setSuppliers(s);
      if (s[0]) setSupplierId(s[0].id);
    });
    apiFetch<Warehouse[]>("/materials/warehouses").then(setWarehouses);
    apiFetch<MaterialCatalogItem[]>("/materials/catalog").then(setMaterials);
  }, []);

  function addLine() {
    if (materials.length === 0) return;
    setLines((l) => [...l, { materialCatalogItemId: materials[0].id, quantity: "1", unitPrice: "0" }]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId || lines.length === 0) return;
    setSubmitting(true);
    try {
      await apiFetch("/materials/purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          supplierId,
          lines: lines.map((l) => ({
            materialCatalogItemId: l.materialCatalogItemId,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
          })),
        }),
      });
      setLines([]);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function receive(orderId: string) {
    if (!warehouses[0]) return;
    await apiFetch(`/materials/purchase-orders/${orderId}/receive`, {
      method: "POST",
      body: JSON.stringify({ warehouseId: warehouses[0].id }),
    });
    load();
  }

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">{t("newOrder")}</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">{t("material")}</span>
              <button type="button" onClick={addLine} className="btn-secondary px-2 py-1 text-xs">
                + {t("addLine")}
              </button>
            </div>
            {lines.map((line, i) => (
              <div key={i} className="flex gap-2">
                <select
                  className="input"
                  value={line.materialCatalogItemId}
                  onChange={(e) =>
                    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, materialCatalogItemId: e.target.value } : l)))
                  }
                >
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.code}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  placeholder={t("quantity")}
                  className="input w-20"
                  value={line.quantity}
                  onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, quantity: e.target.value } : l)))}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder={t("unitPrice")}
                  className="input w-20"
                  value={line.unitPrice}
                  onChange={(e) =>
                    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, unitPrice: e.target.value } : l)))
                  }
                />
              </div>
            ))}

            <button type="submit" disabled={submitting || lines.length === 0} className="btn-primary mt-2">
              {tc("create")}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2">
          {!orders ? (
            <p className="text-gray-500">{tc("loading")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {orders.map((po) => (
                <li key={po.id} className="card">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{po.supplier.name}</div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        po.status === "received" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {t(po.status)}
                    </span>
                  </div>
                  <ul className="mt-2 text-sm text-gray-500">
                    {po.lines.map((l) => (
                      <li key={l.id}>
                        {l.materialCatalogItem.code} × {l.quantity} @ {l.unitPrice} {me?.company.currency}
                      </li>
                    ))}
                  </ul>
                  {po.status !== "received" && (
                    <button onClick={() => receive(po.id)} className="btn-secondary mt-3">
                      {t("receive")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AuthenticatedShell>
  );
}
