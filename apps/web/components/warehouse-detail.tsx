"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatDate } from "@/lib/format-date";
import { resetStateInEffect } from "@/lib/effect-reset";

interface Warehouse {
  id: string;
  name: string;
}
interface MaterialCatalogItem {
  id: string;
  code: string;
  name: string;
}
interface StockLevel {
  id: string;
  quantityOnHand: string;
  binLocation: string | null;
  materialCatalogItem: MaterialCatalogItem & { unit: string };
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
interface StockMovement {
  id: string;
  type: "receipt" | "issue" | "transfer" | "write_off";
  quantity: string;
  unitCost: string | null;
  createdAt: string;
  materialCatalogItem: { id: string; code: string; name: string; unit: string };
  project: { id: string; name: string } | null;
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

const GENERIC_MOVEMENT_TYPES = ["receipt", "issue", "write_off"] as const;

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
    if (selectedMaterial) resetStateInEffect(() => setQuery(selectedMaterial.code));
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

export function WarehouseDetail({ warehouseId, allWarehouses }: { warehouseId: string; allWarehouses: Warehouse[] }) {
  const t = useTranslations("warehouses");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const MOVEMENTS_PAGE_SIZE = 100;
  const [levels, setLevels] = useState<StockLevel[] | null>(null);
  const [movements, setMovements] = useState<StockMovement[] | null>(null);
  const [movementsHasMore, setMovementsHasMore] = useState(false);
  const [movementsLoadMoreBusy, setMovementsLoadMoreBusy] = useState(false);
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
      resetStateInEffect(() => setLineInputs(Object.fromEntries(activeCount.lines.map((l) => [l.id, l.countedQuantity]))));
    }
  }, [activeCount?.id]);

  const otherWarehouses = allWarehouses.filter((w) => w.id !== warehouseId);

  function load() {
    apiFetch<StockLevel[]>(`/materials/stock/levels?warehouseId=${warehouseId}`).then(setLevels);
    apiFetch<InventoryValuation>(`/materials/stock/valuation?warehouseId=${warehouseId}`).then(setValuation);
    apiFetch<StockTransfer[]>(`/materials/stock-transfers?warehouseId=${warehouseId}`).then(setStockTransfers);
    apiFetch<StockMovement[]>(`/materials/stock/movements?warehouseId=${warehouseId}`).then((page) => {
      setMovements(page);
      setMovementsHasMore(page.length === MOVEMENTS_PAGE_SIZE);
    });
  }

  function loadCounts() {
    apiFetch<StockCount[]>(`/materials/stock/counts?warehouseId=${warehouseId}`).then(setCounts);
  }

  async function loadMoreMovements() {
    if (!movements || movements.length === 0) return;
    setMovementsLoadMoreBusy(true);
    try {
      const page = await apiFetch<StockMovement[]>(
        `/materials/stock/movements?warehouseId=${warehouseId}&cursor=${movements[movements.length - 1].id}`,
      );
      setMovements([...movements, ...page]);
      setMovementsHasMore(page.length === MOVEMENTS_PAGE_SIZE);
    } finally {
      setMovementsLoadMoreBusy(false);
    }
  }

  useEffect(() => {
    load();
    loadCounts();
    resetStateInEffect(() => setActiveCount(null));
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
      resetStateInEffect(() => setTransfer((tr) => ({ ...tr, toWarehouseId: otherWarehouses[0].id })));
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
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("scanBarcode")}</h2>
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
        <div className="mt-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-sm">
          <p className="font-medium text-gray-900 dark:text-gray-50">
            {barcodeResult.name} ({barcodeResult.code})
          </p>
          {barcodeResult.stockLevels.length === 0 ? (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t("noStockAnywhere")}</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-0.5 text-xs text-gray-500 dark:text-gray-400">
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

      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("stockLevels")}</h2>
      {!levels ? (
        <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="py-2">{t("material")}</th>
              <th>{t("quantity")}</th>
              <th>{t("bin")}</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((l) => (
              <tr key={l.id} className="border-b border-gray-100 dark:border-gray-700">
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
                      className="text-xs text-gray-500 dark:text-gray-400 hover:underline"
                    >
                      {l.binLocation ?? t("setBin")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {valuation && valuation.rows.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("inventoryValuation")}</h2>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("inventoryValuationHint", { method: t(`costingMethod_${valuation.method}`) })}</p>
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-2">{t("material")}</th>
                <th>{t("quantity")}</th>
                <th className="text-right">{t("unitValue")}</th>
                <th className="text-right">{t("totalValue")}</th>
              </tr>
            </thead>
            <tbody>
              {valuation.rows.map((row) => (
                <tr key={row.materialCatalogItemId} className="border-b border-gray-100 dark:border-gray-700">
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
        </div>
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("recordMovement")}</h2>
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

      {movements && movements.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("movementHistory")}</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="py-2">{t("material")}</th>
                  <th>{t("movementType")}</th>
                  <th>{t("movementQuantity")}</th>
                  <th>{t("movementProject")}</th>
                  <th>{t("movementDate")}</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((mv) => (
                  <tr key={mv.id} className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300">
                    <td className="py-1.5">
                      {mv.materialCatalogItem.name} ({mv.materialCatalogItem.code})
                    </td>
                    <td>{t(mv.type)}</td>
                    <td>
                      {mv.quantity} {mv.materialCatalogItem.unit}
                    </td>
                    <td>
                      {mv.project ? (
                        <Link href={`/projects/${mv.project.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                          {mv.project.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{formatDate(new Date(mv.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {movementsHasMore && (
            <button onClick={loadMoreMovements} disabled={movementsLoadMoreBusy} className="btn-secondary mt-3 px-2.5 py-1 text-xs">
              {t("loadMoreMovements")}
            </button>
          )}
        </div>
      )}

      {otherWarehouses.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("transferStock")}</h2>
          <form onSubmit={recordTransfer} className="flex flex-wrap items-end gap-2">
            <MaterialPicker
              id="transfer-material"
              materials={materials}
              value={transfer.materialCatalogItemId}
              onChange={(id) => setTransfer((tr) => ({ ...tr, materialCatalogItemId: id }))}
            />
            <span className="pb-2.5 text-sm text-gray-400 dark:text-gray-500">→</span>
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

          <h2 className="mb-1 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("inTransitTransfer")}</h2>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("inTransitTransferHint")}</p>
          <form onSubmit={initiateStockTransfer} className="flex flex-wrap items-end gap-2">
            <MaterialPicker
              id="in-transit-material"
              materials={materials}
              value={inTransitForm.materialCatalogItemId}
              onChange={(id) => setInTransitForm((f) => ({ ...f, materialCatalogItemId: id }))}
            />
            <span className="pb-2.5 text-sm text-gray-400 dark:text-gray-500">→</span>
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
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-2">{t("material")}</th>
                <th>{t("route")}</th>
                <th>{t("quantity")}</th>
                <th>{tc("status")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stockTransfers.map((tr) => (
                <tr key={tr.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">{tr.materialCatalogItem.name}</td>
                  <td className="text-xs text-gray-500 dark:text-gray-400">
                    {tr.fromWarehouse.name} → {tr.toWarehouse.name}
                  </td>
                  <td>
                    {tr.quantity} {tr.materialCatalogItem.unit}
                  </td>
                  <td>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        tr.status === "in_transit"
                          ? "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400"
                          : tr.status === "received"
                            ? "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
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
                      <button onClick={() => cancelStockTransfer(tr.id)} disabled={busy} className="ml-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-error-600">
                        {tc("cancel")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("stockCounts")}</h2>
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
                  <span className="text-sm">{formatDate(new Date(c.createdAt))}</span>
                  <span className="flex items-center gap-2 text-xs">
                    {varianceCount > 0 && (
                      <span className="text-warning-700 dark:text-warning-500">
                        {t("variances", { count: varianceCount })}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        c.status === "finalized" ? "bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-400" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
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
          <button onClick={() => setActiveCount(null)} className="mb-2 text-xs text-gray-500 dark:text-gray-400 hover:underline">
            ← {tc("back")}
          </button>
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
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
                  <tr key={line.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-1.5">
                      {line.materialCatalogItem.name} ({line.materialCatalogItem.code})
                    </td>
                    <td className="text-gray-500 dark:text-gray-400">
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
                    <td className={variance === 0 ? "text-gray-400 dark:text-gray-500" : variance > 0 ? "text-success-700 dark:text-success-500" : "text-error-600"}>
                      {variance > 0 ? "+" : ""}
                      {variance !== 0 ? variance : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
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
