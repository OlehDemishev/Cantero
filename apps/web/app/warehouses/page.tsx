"use client";

import { Fragment, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { CsvImportButton } from "@/components/csv-import-button";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

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
  reorderThreshold: string | null;
  reorderQuantity: string | null;
  preferredSupplierId: string | null;
  carbonFootprintKgCo2e: string | null;
  greenCertified: boolean;
  greenCertificationBody: string | null;
  barcode: string | null;
}
interface StockLevel {
  id: string;
  quantityOnHand: string;
  binLocation: string | null;
  materialCatalogItem: MaterialCatalogItem;
  warehouse: { id: string };
}
interface BarcodeStockLevel {
  warehouse: { id: string; name: string };
  quantityOnHand: string;
  binLocation: string | null;
}
interface BarcodeLookupResult {
  id: string;
  code: string;
  name: string;
  unit: string;
  stockLevels: BarcodeStockLevel[];
}
interface Supplier {
  id: string;
  name: string;
}
interface StockCountLine {
  id: string;
  materialCatalogItemId: string;
  systemQuantity: string;
  countedQuantity: string;
  materialCatalogItem: { code: string; name: string; unit: string };
}
interface StockCount {
  id: string;
  status: "draft" | "finalized";
  createdAt: string;
  finalizedAt: string | null;
  lines: StockCountLine[];
}
interface StockTransfer {
  id: string;
  quantity: string;
  unitCost: string | null;
  status: "in_transit" | "received" | "cancelled";
  initiatedByName: string;
  initiatedAt: string;
  receivedByName: string | null;
  receivedAt: string | null;
  fromWarehouse: { id: string; name: string };
  toWarehouse: { id: string; name: string };
  materialCatalogItem: { id: string; name: string; unit: string };
}
interface InventoryValuationRow {
  warehouseId: string;
  materialCatalogItemId: string;
  materialName: string;
  unit: string;
  quantity: number;
  unitValue: number | null;
  totalValue: number;
}
interface InventoryValuation {
  method: "fifo" | "weighted_average";
  rows: InventoryValuationRow[];
  totalValue: number;
}
interface PricePoint {
  date: string;
  unitPrice: number;
  supplierName: string;
  source: "order" | "catalog";
}
interface SupplierPrice {
  supplierId: string;
  supplierName: string;
  latestUnitPrice: number;
  latestOrderDate: string;
  averageUnitPrice: number;
  orderCount: number;
}

const GENERIC_MOVEMENT_TYPES = ["receipt", "issue", "write_off"] as const;

export default function WarehousesPage() {
  const t = useTranslations("warehouses");
  const tc = useTranslations("common");
  const ti = useTranslations("import");

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <CsvImportButton
          endpoint="/materials/catalog/import"
          label={ti("importMaterials")}
          onDone={() => window.location.reload()}
        />
      </div>

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
            <WarehouseDetail warehouseId={selected} allWarehouses={warehouses} />
          ) : null}
        </div>
      </div>

      <ReorderSettings />
      <SustainabilitySettings />
    </AuthenticatedShell>
  );
}

/** Type-ahead SKU entry: type or pick a code from the native datalist, matching sets the id. */
function MaterialPicker({
  id,
  materials,
  value,
  onChange,
}: {
  id: string;
  materials: MaterialCatalogItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedMaterial = materials.find((m) => m.id === value);

  useEffect(() => {
    if (selectedMaterial) setQuery(selectedMaterial.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMaterial?.id]);

  function handleInput(next: string) {
    setQuery(next);
    const match = materials.find((m) => m.code.toLowerCase() === next.trim().toLowerCase());
    if (match) onChange(match.id);
  }

  return (
    <>
      <input
        list={id}
        className="input w-36"
        placeholder="SKU"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
      />
      <datalist id={id}>
        {materials.map((m) => (
          <option key={m.id} value={m.code}>
            {m.name}
          </option>
        ))}
      </datalist>
    </>
  );
}

function WarehouseDetail({ warehouseId, allWarehouses }: { warehouseId: string; allWarehouses: Warehouse[] }) {
  const t = useTranslations("warehouses");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [levels, setLevels] = useState<StockLevel[] | null>(null);
  const [materials, setMaterials] = useState<MaterialCatalogItem[]>([]);
  const [movement, setMovement] = useState({
    materialCatalogItemId: "",
    type: "receipt" as (typeof GENERIC_MOVEMENT_TYPES)[number],
    quantity: "1",
    unitCost: "",
  });
  const [valuation, setValuation] = useState<InventoryValuation | null>(null);
  const [transfer, setTransfer] = useState({ materialCatalogItemId: "", toWarehouseId: "", quantity: "1" });
  const [inTransitForm, setInTransitForm] = useState({ materialCatalogItemId: "", toWarehouseId: "", quantity: "1" });
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<StockCount[] | null>(null);
  const [activeCount, setActiveCount] = useState<StockCount | null>(null);
  const [lineInputs, setLineInputs] = useState<Record<string, string>>({});
  const [editingBinFor, setEditingBinFor] = useState<string | null>(null);
  const [binDraft, setBinDraft] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeResult, setBarcodeResult] = useState<BarcodeLookupResult | null>(null);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  useEffect(() => {
    if (activeCount) {
      setLineInputs(Object.fromEntries(activeCount.lines.map((l) => [l.id, l.countedQuantity])));
    }
  }, [activeCount?.id]);

  const otherWarehouses = allWarehouses.filter((w) => w.id !== warehouseId);

  function load() {
    apiFetch<StockLevel[]>(`/materials/stock/levels?warehouseId=${warehouseId}`).then(setLevels);
    apiFetch<InventoryValuation>(`/materials/stock/valuation?warehouseId=${warehouseId}`).then(setValuation);
    apiFetch<StockTransfer[]>(`/materials/stock-transfers?warehouseId=${warehouseId}`).then(setStockTransfers);
  }

  function loadCounts() {
    apiFetch<StockCount[]>(`/materials/stock/counts?warehouseId=${warehouseId}`).then(setCounts);
  }

  useEffect(() => {
    load();
    loadCounts();
    setActiveCount(null);
    apiFetch<MaterialCatalogItem[]>("/materials/catalog").then((items) => {
      setMaterials(items);
      if (items[0]) {
        setMovement((m) => ({ ...m, materialCatalogItemId: items[0].id }));
        setTransfer((tr) => ({ ...tr, materialCatalogItemId: items[0].id }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId]);

  async function startCount() {
    setBusy(true);
    try {
      const count = await apiFetch<StockCount>("/materials/stock/counts", {
        method: "POST",
        body: JSON.stringify({ warehouseId }),
      });
      setActiveCount(count);
      loadCounts();
    } finally {
      setBusy(false);
    }
  }

  async function viewCount(id: string) {
    const count = await apiFetch<StockCount>(`/materials/stock/counts/${id}`);
    setActiveCount(count);
  }

  async function saveLine(lineId: string, countedQuantity: string) {
    if (!activeCount || countedQuantity === "") return;
    await apiFetch(`/materials/stock/counts/${activeCount.id}/lines/${lineId}`, {
      method: "PATCH",
      body: JSON.stringify({ countedQuantity: Number(countedQuantity) }),
    });
    setActiveCount((c) =>
      c ? { ...c, lines: c.lines.map((l) => (l.id === lineId ? { ...l, countedQuantity } : l)) } : c,
    );
  }

  async function finalizeCount() {
    if (!activeCount) return;
    setBusy(true);
    try {
      await apiFetch(`/materials/stock/counts/${activeCount.id}/finalize`, { method: "POST" });
      setActiveCount(null);
      loadCounts();
      load();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!transfer.toWarehouseId && otherWarehouses[0]) {
      setTransfer((tr) => ({ ...tr, toWarehouseId: otherWarehouses[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherWarehouses[0]?.id]);

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
          unitCost: movement.type === "receipt" && movement.unitCost ? Number(movement.unitCost) : undefined,
        }),
      });
      setMovement((m) => ({ ...m, unitCost: "" }));
      load();
    } finally {
      setBusy(false);
    }
  }

  async function saveBinLocation(materialCatalogItemId: string) {
    setBusy(true);
    try {
      await apiFetch("/materials/stock/bin-location", {
        method: "POST",
        body: JSON.stringify({ warehouseId, materialCatalogItemId, binLocation: binDraft || null }),
      });
      setEditingBinFor(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function lookupBarcode(e: React.FormEvent) {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    setBarcodeError(null);
    setBarcodeResult(null);
    try {
      const result = await apiFetch<BarcodeLookupResult>(`/materials/catalog/by-barcode/${encodeURIComponent(barcodeInput.trim())}`);
      setBarcodeResult(result);
    } catch (err) {
      setBarcodeError(err instanceof Error ? err.message : tc("error"));
    }
  }

  async function recordTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!transfer.toWarehouseId) return;
    setBusy(true);
    try {
      await apiFetch("/materials/stock/transfer", {
        method: "POST",
        body: JSON.stringify({
          fromWarehouseId: warehouseId,
          toWarehouseId: transfer.toWarehouseId,
          materialCatalogItemId: transfer.materialCatalogItemId,
          quantity: Number(transfer.quantity),
        }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function initiateStockTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!inTransitForm.toWarehouseId) return;
    setBusy(true);
    try {
      await apiFetch("/materials/stock-transfers", {
        method: "POST",
        body: JSON.stringify({
          fromWarehouseId: warehouseId,
          toWarehouseId: inTransitForm.toWarehouseId,
          materialCatalogItemId: inTransitForm.materialCatalogItemId,
          quantity: Number(inTransitForm.quantity),
        }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function receiveStockTransfer(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/materials/stock-transfers/${id}/receive`, { method: "POST" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function cancelStockTransfer(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/materials/stock-transfers/${id}/cancel`, { method: "POST" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("scanBarcode")}</h2>
      <form onSubmit={lookupBarcode} className="flex items-end gap-2">
        <input
          placeholder={t("barcodePlaceholder")}
          className="input w-56"
          value={barcodeInput}
          onChange={(e) => setBarcodeInput(e.target.value)}
        />
        <button type="submit" className="btn-secondary px-3 py-1.5 text-xs">
          {t("lookUp")}
        </button>
      </form>
      {barcodeError && <p className="mt-1 text-xs text-error-600">{barcodeError}</p>}
      {barcodeResult && (
        <div className="mt-2 rounded-md border border-gray-200 bg-white p-3 text-sm">
          <p className="font-medium text-gray-900">
            {barcodeResult.name} ({barcodeResult.code})
          </p>
          {barcodeResult.stockLevels.length === 0 ? (
            <p className="mt-1 text-xs text-gray-400">{t("noStockAnywhere")}</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-0.5 text-xs text-gray-500">
              {barcodeResult.stockLevels.map((sl) => (
                <li key={sl.warehouse.id}>
                  {sl.warehouse.name}: {sl.quantityOnHand} {barcodeResult.unit}
                  {sl.binLocation && ` — ${t("bin")} ${sl.binLocation}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{t("stockLevels")}</h2>
      {!levels ? (
        <p className="text-gray-500">{tc("loading")}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">{t("material")}</th>
              <th>{t("quantity")}</th>
              <th>{t("bin")}</th>
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
                <td>
                  {editingBinFor === l.materialCatalogItem.id ? (
                    <span className="flex items-center gap-1">
                      <input
                        autoFocus
                        className="input w-24 py-0.5 text-xs"
                        value={binDraft}
                        onChange={(e) => setBinDraft(e.target.value)}
                      />
                      <button onClick={() => saveBinLocation(l.materialCatalogItem.id)} disabled={busy} className="btn-primary px-1.5 py-0.5 text-xs">
                        {tc("save")}
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingBinFor(l.materialCatalogItem.id);
                        setBinDraft(l.binLocation ?? "");
                      }}
                      className="text-xs text-gray-500 hover:underline"
                    >
                      {l.binLocation ?? t("setBin")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {valuation && valuation.rows.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("inventoryValuation")}</h2>
          <p className="mb-3 text-xs text-gray-500">{t("inventoryValuationHint", { method: t(`costingMethod_${valuation.method}`) })}</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2">{t("material")}</th>
                <th>{t("quantity")}</th>
                <th className="text-right">{t("unitValue")}</th>
                <th className="text-right">{t("totalValue")}</th>
              </tr>
            </thead>
            <tbody>
              {valuation.rows.map((row) => (
                <tr key={row.materialCatalogItemId} className="border-b border-gray-100">
                  <td className="py-2">{row.materialName}</td>
                  <td>
                    {row.quantity} {row.unit}
                  </td>
                  <td className="text-right">{row.unitValue !== null ? `${row.unitValue.toFixed(4)} ${currency}` : "—"}</td>
                  <td className="text-right font-medium">{row.totalValue.toFixed(2)} {currency}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="pt-2" colSpan={3}>
                  {t("total")}
                </td>
                <td className="pt-2 text-right">
                  {valuation.totalValue.toFixed(2)} {currency}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{t("recordMovement")}</h2>
      <form onSubmit={recordMovement} className="flex flex-wrap items-end gap-2">
        <MaterialPicker
          id="movement-material"
          materials={materials}
          value={movement.materialCatalogItemId}
          onChange={(id) => setMovement((m) => ({ ...m, materialCatalogItemId: id }))}
        />
        <select
          className="input w-auto"
          value={movement.type}
          onChange={(e) =>
            setMovement((m) => ({ ...m, type: e.target.value as (typeof GENERIC_MOVEMENT_TYPES)[number] }))
          }
        >
          {GENERIC_MOVEMENT_TYPES.map((ty) => (
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
        {movement.type === "receipt" && (
          <input
            type="number"
            step="0.0001"
            min="0"
            placeholder={t("unitCostPlaceholder")}
            className="input w-32"
            value={movement.unitCost}
            onChange={(e) => setMovement((m) => ({ ...m, unitCost: e.target.value }))}
          />
        )}
        <button type="submit" disabled={busy} className="btn-secondary">
          {tc("save")}
        </button>
      </form>

      {otherWarehouses.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{t("transferStock")}</h2>
          <form onSubmit={recordTransfer} className="flex flex-wrap items-end gap-2">
            <MaterialPicker
              id="transfer-material"
              materials={materials}
              value={transfer.materialCatalogItemId}
              onChange={(id) => setTransfer((tr) => ({ ...tr, materialCatalogItemId: id }))}
            />
            <span className="pb-2.5 text-sm text-gray-400">→</span>
            <select
              className="input w-auto"
              value={transfer.toWarehouseId}
              onChange={(e) => setTransfer((tr) => ({ ...tr, toWarehouseId: e.target.value }))}
            >
              {otherWarehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              className="input w-24"
              value={transfer.quantity}
              onChange={(e) => setTransfer((tr) => ({ ...tr, quantity: e.target.value }))}
            />
            <button type="submit" disabled={busy} className="btn-secondary">
              {t("transfer")}
            </button>
          </form>

          <h2 className="mb-1 mt-8 text-sm font-semibold text-gray-700">{t("inTransitTransfer")}</h2>
          <p className="mb-3 text-xs text-gray-500">{t("inTransitTransferHint")}</p>
          <form onSubmit={initiateStockTransfer} className="flex flex-wrap items-end gap-2">
            <MaterialPicker
              id="in-transit-material"
              materials={materials}
              value={inTransitForm.materialCatalogItemId}
              onChange={(id) => setInTransitForm((f) => ({ ...f, materialCatalogItemId: id }))}
            />
            <span className="pb-2.5 text-sm text-gray-400">→</span>
            <select
              className="input w-auto"
              value={inTransitForm.toWarehouseId}
              onChange={(e) => setInTransitForm((f) => ({ ...f, toWarehouseId: e.target.value }))}
            >
              {otherWarehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              className="input w-24"
              value={inTransitForm.quantity}
              onChange={(e) => setInTransitForm((f) => ({ ...f, quantity: e.target.value }))}
            />
            <button type="submit" disabled={busy} className="btn-secondary">
              {t("initiateTransfer")}
            </button>
          </form>
        </>
      )}

      {stockTransfers && stockTransfers.length > 0 && (
        <div className="mt-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2">{t("material")}</th>
                <th>{t("route")}</th>
                <th>{t("quantity")}</th>
                <th>{tc("status")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stockTransfers.map((tr) => (
                <tr key={tr.id} className="border-b border-gray-100">
                  <td className="py-2">{tr.materialCatalogItem.name}</td>
                  <td className="text-xs text-gray-500">
                    {tr.fromWarehouse.name} → {tr.toWarehouse.name}
                  </td>
                  <td>
                    {tr.quantity} {tr.materialCatalogItem.unit}
                  </td>
                  <td>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        tr.status === "in_transit"
                          ? "bg-brand-50 text-brand-700"
                          : tr.status === "received"
                            ? "bg-success-50 text-success-700"
                            : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {t(`transferStatus_${tr.status}`)}
                    </span>
                  </td>
                  <td className="text-right">
                    {tr.status === "in_transit" && tr.toWarehouse.id === warehouseId && (
                      <button onClick={() => receiveStockTransfer(tr.id)} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                        {t("receiveTransfer")}
                      </button>
                    )}
                    {tr.status === "in_transit" && tr.fromWarehouse.id === warehouseId && (
                      <button onClick={() => cancelStockTransfer(tr.id)} disabled={busy} className="ml-1.5 text-xs text-gray-400 hover:text-error-600">
                        {tc("cancel")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{t("stockCounts")}</h2>
        <button onClick={startCount} disabled={busy} className="btn-secondary px-3 py-1 text-xs">
          {t("startCount")}
        </button>
      </div>

      {counts && counts.length > 0 && !activeCount && (
        <ul className="flex flex-col gap-2">
          {counts.map((c) => {
            const varianceCount = c.lines.filter((l) => l.countedQuantity !== l.systemQuantity).length;
            return (
              <li key={c.id}>
                <button
                  onClick={() => viewCount(c.id)}
                  className="card flex w-full items-center justify-between text-left hover:border-gray-400"
                >
                  <span className="text-sm">{new Date(c.createdAt).toLocaleDateString()}</span>
                  <span className="flex items-center gap-2 text-xs">
                    {varianceCount > 0 && (
                      <span className="text-warning-700">
                        {t("variances", { count: varianceCount })}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        c.status === "finalized" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {t(c.status)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {activeCount && (
        <div>
          <button onClick={() => setActiveCount(null)} className="mb-2 text-xs text-gray-500 hover:underline">
            ← {tc("back")}
          </button>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2">{t("material")}</th>
                <th>{t("systemQuantity")}</th>
                <th>{t("countedQuantity")}</th>
                <th>{t("variance")}</th>
              </tr>
            </thead>
            <tbody>
              {activeCount.lines.map((line) => {
                const variance = Number(lineInputs[line.id] ?? line.countedQuantity) - Number(line.systemQuantity);
                return (
                  <tr key={line.id} className="border-b border-gray-100">
                    <td className="py-1.5">
                      {line.materialCatalogItem.name} ({line.materialCatalogItem.code})
                    </td>
                    <td className="text-gray-500">
                      {line.systemQuantity} {line.materialCatalogItem.unit}
                    </td>
                    <td>
                      {activeCount.status === "draft" ? (
                        <input
                          type="number"
                          step="0.01"
                          className="input w-24"
                          value={lineInputs[line.id] ?? line.countedQuantity}
                          onChange={(e) => setLineInputs((li) => ({ ...li, [line.id]: e.target.value }))}
                          onBlur={(e) => saveLine(line.id, e.target.value)}
                        />
                      ) : (
                        <span>
                          {line.countedQuantity} {line.materialCatalogItem.unit}
                        </span>
                      )}
                    </td>
                    <td className={variance === 0 ? "text-gray-400" : variance > 0 ? "text-success-700" : "text-error-600"}>
                      {variance > 0 ? "+" : ""}
                      {variance !== 0 ? variance : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {activeCount.status === "draft" && (
            <button onClick={finalizeCount} disabled={busy} className="btn-primary mt-3">
              {t("finalizeCount")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ReorderSettings() {
  const t = useTranslations("warehouses");
  const tc = useTranslations("common");

  const [materials, setMaterials] = useState<MaterialCatalogItem[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { reorderThreshold: string; reorderQuantity: string; preferredSupplierId: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[] | null>(null);
  const [supplierPrices, setSupplierPrices] = useState<SupplierPrice[] | null>(null);
  const [barcodeDraft, setBarcodeDraft] = useState("");
  const [barcodeSaving, setBarcodeSaving] = useState(false);

  function load() {
    apiFetch<MaterialCatalogItem[]>("/materials/catalog").then((items) => {
      setMaterials(items);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const item of items) {
          if (!next[item.id]) {
            next[item.id] = {
              reorderThreshold: item.reorderThreshold ?? "",
              reorderQuantity: item.reorderQuantity ?? "",
              preferredSupplierId: item.preferredSupplierId ?? "",
            };
          }
        }
        return next;
      });
    });
  }

  useEffect(() => {
    load();
    apiFetch<Supplier[]>("/materials/suppliers").then(setSuppliers);
  }, []);

  async function save(materialId: string) {
    const draft = drafts[materialId];
    if (!draft) return;
    setSavingId(materialId);
    setSavedId(null);
    try {
      await apiFetch(`/materials/catalog/${materialId}/reorder-settings`, {
        method: "PATCH",
        body: JSON.stringify({
          reorderThreshold: draft.reorderThreshold === "" ? null : Number(draft.reorderThreshold),
          reorderQuantity: draft.reorderQuantity === "" ? null : Number(draft.reorderQuantity),
          preferredSupplierId: draft.preferredSupplierId || null,
        }),
      });
      setSavedId(materialId);
      load();
    } finally {
      setSavingId(null);
    }
  }

  async function toggleExpand(materialId: string, currentBarcode: string | null) {
    if (expandedId === materialId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(materialId);
    setPriceHistory(null);
    setSupplierPrices(null);
    setBarcodeDraft(currentBarcode ?? "");
    apiFetch<PricePoint[]>(`/materials/catalog/${materialId}/price-history`).then(setPriceHistory);
    apiFetch<SupplierPrice[]>(`/materials/catalog/${materialId}/supplier-prices`).then(setSupplierPrices);
  }

  async function saveBarcode(materialId: string) {
    setBarcodeSaving(true);
    try {
      await apiFetch(`/materials/catalog/${materialId}/barcode`, {
        method: "PATCH",
        body: JSON.stringify({ barcode: barcodeDraft || null }),
      });
      load();
    } finally {
      setBarcodeSaving(false);
    }
  }

  if (!materials || materials.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("reorderSettings")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("reorderSettingsHint")}</p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="py-2">{t("material")}</th>
            <th>{t("reorderThreshold")}</th>
            <th>{t("reorderQuantity")}</th>
            <th>{t("preferredSupplier")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => {
            const draft = drafts[m.id] ?? { reorderThreshold: "", reorderQuantity: "", preferredSupplierId: "" };
            return (
              <Fragment key={m.id}>
              <tr className="border-b border-gray-100">
                <td className="py-2">
                  <button type="button" onClick={() => toggleExpand(m.id, m.barcode)} className="text-left hover:underline">
                    {m.name} ({m.code})
                  </button>
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    className="input w-24"
                    value={draft.reorderThreshold}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [m.id]: { ...draft, reorderThreshold: e.target.value } }))
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    className="input w-24"
                    value={draft.reorderQuantity}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [m.id]: { ...draft, reorderQuantity: e.target.value } }))
                    }
                  />
                </td>
                <td>
                  <select
                    className="input w-auto"
                    value={draft.preferredSupplierId}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [m.id]: { ...draft, preferredSupplierId: e.target.value } }))
                    }
                  >
                    <option value="">{t("noSupplier")}</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button onClick={() => save(m.id)} disabled={savingId === m.id} className="btn-secondary px-3 py-1 text-xs">
                    {tc("save")}
                  </button>
                  {savedId === m.id && <span className="ml-2 text-xs text-success-700">{tc("saved")}</span>}
                </td>
              </tr>
              {expandedId === m.id && (
                <tr className="border-b border-gray-100 bg-gray-50">
                  <td colSpan={5} className="py-3">
                    <div className="mb-4 flex items-end gap-2">
                      <label className="flex flex-col gap-1 text-xs text-gray-500">
                        {t("barcode")}
                        <input className="input w-40" value={barcodeDraft} onChange={(e) => setBarcodeDraft(e.target.value)} />
                      </label>
                      <button onClick={() => saveBarcode(m.id)} disabled={barcodeSaving} className="btn-secondary px-2.5 py-1 text-xs">
                        {tc("save")}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                      <div>
                        <div className="mb-2 text-xs font-semibold text-gray-500">{t("priceHistory")}</div>
                        {!priceHistory ? (
                          <p className="text-xs text-gray-400">{tc("loading")}</p>
                        ) : priceHistory.length <= 1 ? (
                          <p className="text-xs text-gray-400">{t("noPriceHistory")}</p>
                        ) : (
                          <table className="w-full text-xs">
                            <tbody>
                              {priceHistory.map((p, i) => (
                                <tr key={i} className="border-b border-gray-200">
                                  <td className="py-1 text-gray-500">
                                    {p.source === "catalog" ? t("currentPrice") : new Date(p.date).toLocaleDateString()}
                                  </td>
                                  <td className="text-gray-500">{p.supplierName}</td>
                                  <td className="text-right font-medium">{p.unitPrice}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                      <div>
                        <div className="mb-2 text-xs font-semibold text-gray-500">{t("supplierComparison")}</div>
                        {!supplierPrices ? (
                          <p className="text-xs text-gray-400">{tc("loading")}</p>
                        ) : supplierPrices.length === 0 ? (
                          <p className="text-xs text-gray-400">{t("noSupplierPrices")}</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-gray-400">
                                <th className="py-1 font-normal">{tc("name")}</th>
                                <th className="font-normal">{t("latestPrice")}</th>
                                <th className="font-normal">{t("avgPrice")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {supplierPrices.map((s, i) => (
                                <tr key={s.supplierId} className="border-b border-gray-200">
                                  <td className={`py-1 ${i === 0 ? "font-medium text-success-700" : "text-gray-700"}`}>
                                    {s.supplierName}
                                  </td>
                                  <td className={i === 0 ? "font-medium text-success-700" : "text-gray-700"}>
                                    {s.latestUnitPrice}
                                  </td>
                                  <td className="text-gray-500">{s.averageUnitPrice}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SustainabilitySettings() {
  const t = useTranslations("warehouses");
  const tc = useTranslations("common");
  const ts = useTranslations("sustainability");

  const [materials, setMaterials] = useState<MaterialCatalogItem[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { carbonFootprintKgCo2e: string; greenCertified: boolean; greenCertificationBody: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  function load() {
    apiFetch<MaterialCatalogItem[]>("/materials/catalog").then((items) => {
      setMaterials(items);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const item of items) {
          if (!next[item.id]) {
            next[item.id] = {
              carbonFootprintKgCo2e: item.carbonFootprintKgCo2e ?? "",
              greenCertified: item.greenCertified,
              greenCertificationBody: item.greenCertificationBody ?? "",
            };
          }
        }
        return next;
      });
    });
  }

  useEffect(load, []);

  async function save(materialId: string) {
    const draft = drafts[materialId];
    if (!draft) return;
    setSavingId(materialId);
    setSavedId(null);
    try {
      await apiFetch(`/materials/catalog/${materialId}/sustainability`, {
        method: "PATCH",
        body: JSON.stringify({
          carbonFootprintKgCo2e: draft.carbonFootprintKgCo2e === "" ? null : Number(draft.carbonFootprintKgCo2e),
          greenCertified: draft.greenCertified,
          greenCertificationBody: draft.greenCertificationBody || null,
        }),
      });
      setSavedId(materialId);
      load();
    } finally {
      setSavingId(null);
    }
  }

  if (!materials || materials.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{ts("materialSettings")}</h2>
      <p className="mb-3 text-xs text-gray-500">{ts("materialSettingsHint")}</p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="py-2">{t("material")}</th>
            <th>{ts("carbonFootprint")}</th>
            <th>{ts("greenCertified")}</th>
            <th>{ts("greenCertificationBody")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => {
            const draft = drafts[m.id] ?? { carbonFootprintKgCo2e: "", greenCertified: false, greenCertificationBody: "" };
            return (
              <tr key={m.id} className="border-b border-gray-100">
                <td className="py-2">
                  {m.name} ({m.code})
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input w-28"
                    value={draft.carbonFootprintKgCo2e}
                    onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: { ...draft, carbonFootprintKgCo2e: e.target.value } }))}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={draft.greenCertified}
                    onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: { ...draft, greenCertified: e.target.checked } }))}
                  />
                </td>
                <td>
                  <input
                    className="input w-32"
                    placeholder={ts("greenCertificationBodyPlaceholder")}
                    value={draft.greenCertificationBody}
                    onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: { ...draft, greenCertificationBody: e.target.value } }))}
                  />
                </td>
                <td className="whitespace-nowrap">
                  <button onClick={() => save(m.id)} disabled={savingId === m.id} className="btn-secondary px-2 py-1 text-xs">
                    {tc("save")}
                  </button>
                  {savedId === m.id && <span className="ml-2 text-xs text-success-700">{tc("saved")}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
