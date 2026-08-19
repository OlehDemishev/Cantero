"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";

interface Warehouse {
  id: string;
  name: string;
  address: string | null;
}
interface MaterialCatalogItem {
  id: string;
  code: string;
  name: string;
  unit: string;
}
interface StockLevel {
  id: string;
  quantityOnHand: string;
  materialCatalogItem: MaterialCatalogItem;
  warehouse: { id: string };
}

const MOVEMENT_TYPES = ["receipt", "issue", "transfer", "write_off"] as const;

export default function WarehousesPage() {
  const t = useTranslations("warehouses");
  const tc = useTranslations("common");

  const [warehouses, setWarehouses] = useState<Warehouse[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", address: "" });
  const [submitting, setSubmitting] = useState(false);

  function loadWarehouses() {
    apiFetch<Warehouse[]>("/materials/warehouses").then((list) => {
      setWarehouses(list);
      if (!selected && list[0]) setSelected(list[0].id);
    });
  }

  useEffect(loadWarehouses, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/materials/warehouses", {
        method: "POST",
        body: JSON.stringify({ name: form.name, address: form.address || undefined }),
      });
      setForm({ name: "", address: "" });
      loadWarehouses();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="card lg:col-span-1 h-fit">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">{t("newWarehouse")}</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              required
              placeholder={tc("name")}
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              placeholder={t("address")}
              className="input"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
            <button type="submit" disabled={submitting} className="btn-primary">
              {tc("create")}
            </button>
          </form>

          {warehouses && warehouses.length > 0 && (
            <div className="mt-6">
              <div className="mb-2 text-xs font-semibold text-gray-500">{t("title")}</div>
              <ul className="flex flex-col gap-1">
                {warehouses.map((w) => (
                  <li key={w.id}>
                    <button
                      onClick={() => setSelected(w.id)}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                        selected === w.id ? "bg-gray-900 text-white" : "hover:bg-gray-100"
                      }`}
                    >
                      {w.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          {!warehouses ? (
            <p className="text-gray-500">{tc("loading")}</p>
          ) : warehouses.length === 0 ? (
            <p className="text-gray-500">{t("empty")}</p>
          ) : selected ? (
            <WarehouseDetail warehouseId={selected} />
          ) : null}
        </div>
      </div>
    </AuthenticatedShell>
  );
}

function WarehouseDetail({ warehouseId }: { warehouseId: string }) {
  const t = useTranslations("warehouses");
  const tc = useTranslations("common");

  const [levels, setLevels] = useState<StockLevel[] | null>(null);
  const [materials, setMaterials] = useState<MaterialCatalogItem[]>([]);
  const [movement, setMovement] = useState({ materialCatalogItemId: "", type: "receipt" as (typeof MOVEMENT_TYPES)[number], quantity: "1" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<StockLevel[]>(`/materials/stock/levels?warehouseId=${warehouseId}`).then(setLevels);
  }

  useEffect(() => {
    load();
    apiFetch<MaterialCatalogItem[]>("/materials/catalog").then((items) => {
      setMaterials(items);
      if (items[0]) setMovement((m) => ({ ...m, materialCatalogItemId: items[0].id }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId]);

  async function recordMovement(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/materials/stock/movements", {
        method: "POST",
        body: JSON.stringify({
          warehouseId,
          materialCatalogItemId: movement.materialCatalogItemId,
          type: movement.type,
          quantity: Number(movement.quantity),
        }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("stockLevels")}</h2>
      {!levels ? (
        <p className="text-gray-500">{tc("loading")}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">{t("material")}</th>
              <th>{t("quantity")}</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((l) => (
              <tr key={l.id} className="border-b border-gray-100">
                <td className="py-2">
                  {l.materialCatalogItem.name} ({l.materialCatalogItem.code})
                </td>
                <td className={Number(l.quantityOnHand) < 0 ? "text-red-600" : ""}>
                  {l.quantityOnHand} {l.materialCatalogItem.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{t("recordMovement")}</h2>
      <form onSubmit={recordMovement} className="flex flex-wrap items-end gap-2">
        <select
          className="input w-auto"
          value={movement.materialCatalogItemId}
          onChange={(e) => setMovement((m) => ({ ...m, materialCatalogItemId: e.target.value }))}
        >
          {materials.map((mat) => (
            <option key={mat.id} value={mat.id}>
              {mat.code}
            </option>
          ))}
        </select>
        <select
          className="input w-auto"
          value={movement.type}
          onChange={(e) => setMovement((m) => ({ ...m, type: e.target.value as (typeof MOVEMENT_TYPES)[number] }))}
        >
          {MOVEMENT_TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(ty)}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="0.01"
          className="input w-24"
          value={movement.quantity}
          onChange={(e) => setMovement((m) => ({ ...m, quantity: e.target.value }))}
        />
        <button type="submit" disabled={busy} className="btn-secondary">
          {tc("save")}
        </button>
      </form>
    </div>
  );
}
