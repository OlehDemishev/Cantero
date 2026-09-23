"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatDate } from "@/lib/format-date";
import { resetStateInEffect } from "@/lib/effect-reset";
import { WarehouseLocations } from "@/components/warehouse-locations";

interface Warehouse {
  id: string;
  name: string;
}
interface MaterialCatalogItem {
  id: string;
  code: string;
  name: string;
  serialTracked?: boolean;
}
interface SerialUnit {
  id: string;
  serialNumber: string;
}
interface StockLevel {
  id: string;
  quantityOnHand: string;
  binLocation: string | null;
  binLocationId: string | null;
  reserved: number;
  available: number;
  materialCatalogItem: MaterialCatalogItem & { unit: string };
  warehouse: { id: string };
}
interface WarehouseLocationOption {
  id: string;
  kind: "zone" | "aisle" | "rack" | "bin";
  code: string;
}
interface StockReservation {
  id: string;
  quantity: string;
  note: string | null;
  status: "active" | "released";
  createdByName: string;
  createdAt: string;
  materialCatalogItem: { id: string; name: string; unit: string };
  project: { id: string; name: string } | null;
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
interface StandardCostVarianceRow {
  materialCatalogItemId: string;
  materialName: string;
  unit: string;
  unitValue: number | null;
  standardCost: number;
  varianceAmount: number;
  variancePercent: number | null;
}
interface Supplier {
  id: string;
  name: string;
}
interface SupplierReturnPO {
  id: string;
  status: string;
}
interface SupplierReturn {
  id: string;
  reason: "defective" | "wrong_item" | "overstock" | "damaged_in_transit" | "other";
  notes: string | null;
  status: "draft" | "sent" | "confirmed";
  createdAt: string;
  supplier: { id: string; name: string };
  purchaseOrder: { id: string };
  lines: { id: string; quantity: string; materialCatalogItem: { id: string; name: string; unit: string } }[];
}

const GENERIC_MOVEMENT_TYPES = ["receipt", "issue", "write_off"] as const;
const SUPPLIER_RETURN_REASONS = ["defective", "wrong_item", "overstock", "damaged_in_transit", "other"] as const;

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
    if (selectedMaterial)
      resetStateInEffect(() => setQuery(selectedMaterial.code));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMaterial?.id]);

  function handleInput(next: string) {
    setQuery(next);
    const match = materials.find(
      (m) => m.code.toLowerCase() === next.trim().toLowerCase(),
    );
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

export function WarehouseDetail({
  warehouseId,
  allWarehouses,
}: {
  warehouseId: string;
  allWarehouses: Warehouse[];
}) {
  const t = useTranslations("warehouses");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const MOVEMENTS_PAGE_SIZE = 100;
  const STOCK_TRANSFERS_PAGE_SIZE = 100;
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
  const [serialNumberDrafts, setSerialNumberDrafts] = useState<string[]>([""]);
  const [availableSerialUnits, setAvailableSerialUnits] = useState<SerialUnit[]>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [valuation, setValuation] = useState<InventoryValuation | null>(null);
  const [standardCostVariance, setStandardCostVariance] = useState<
    StandardCostVarianceRow[] | null
  >(null);
  const [transfer, setTransfer] = useState({
    materialCatalogItemId: "",
    toWarehouseId: "",
    quantity: "1",
  });
  const [inTransitForm, setInTransitForm] = useState({
    materialCatalogItemId: "",
    toWarehouseId: "",
    quantity: "1",
  });
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[] | null>(
    null,
  );
  const [stockTransfersHasMore, setStockTransfersHasMore] = useState(false);
  const [stockTransfersLoadMoreBusy, setStockTransfersLoadMoreBusy] =
    useState(false);
  const [reservations, setReservations] = useState<StockReservation[] | null>(
    null,
  );
  const [reservationForm, setReservationForm] = useState({
    materialCatalogItemId: "",
    quantity: "1",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<StockCount[] | null>(null);
  const [activeCount, setActiveCount] = useState<StockCount | null>(null);
  const [lineInputs, setLineInputs] = useState<Record<string, string>>({});
  const [editingBinFor, setEditingBinFor] = useState<string | null>(null);
  const [binDraft, setBinDraft] = useState("");
  const [warehouseLocationOptions, setWarehouseLocationOptions] = useState<
    WarehouseLocationOption[]
  >([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stockKits, setStockKits] = useState<{ id: string; name: string }[]>([]);
  const [assembleForm, setAssembleForm] = useState({ kitId: "", quantity: "1" });
  const [supplierReturnPOs, setSupplierReturnPOs] = useState<SupplierReturnPO[]>([]);
  const [supplierReturns, setSupplierReturns] = useState<SupplierReturn[] | null>(null);
  const [supplierReturnForm, setSupplierReturnForm] = useState({
    supplierId: "",
    purchaseOrderId: "",
    reason: "defective" as (typeof SUPPLIER_RETURN_REASONS)[number],
    notes: "",
  });
  const [supplierReturnLines, setSupplierReturnLines] = useState<
    { materialCatalogItemId: string; quantity: string }[]
  >([{ materialCatalogItemId: "", quantity: "1" }]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeResult, setBarcodeResult] =
    useState<BarcodeLookupResult | null>(null);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  useEffect(() => {
    if (activeCount) {
      resetStateInEffect(() =>
        setLineInputs(
          Object.fromEntries(
            activeCount.lines.map((l) => [l.id, l.countedQuantity]),
          ),
        ),
      );
    }
  }, [activeCount?.id]);

  const otherWarehouses = allWarehouses.filter((w) => w.id !== warehouseId);

  function load() {
    apiFetch<StockLevel[]>(
      `/materials/stock/levels?warehouseId=${warehouseId}`,
    ).then(setLevels);
    apiFetch<InventoryValuation>(
      `/materials/stock/valuation?warehouseId=${warehouseId}`,
    ).then(setValuation);
    apiFetch<StandardCostVarianceRow[]>(
      `/materials/stock/standard-cost-variance?warehouseId=${warehouseId}`,
    ).then(setStandardCostVariance);
    apiFetch<StockTransfer[]>(
      `/materials/stock-transfers?warehouseId=${warehouseId}`,
    ).then((page) => {
      setStockTransfers(page);
      setStockTransfersHasMore(page.length === STOCK_TRANSFERS_PAGE_SIZE);
    });
    apiFetch<StockMovement[]>(
      `/materials/stock/movements?warehouseId=${warehouseId}`,
    ).then((page) => {
      setMovements(page);
      setMovementsHasMore(page.length === MOVEMENTS_PAGE_SIZE);
    });
    apiFetch<WarehouseLocationOption[]>(
      `/materials/warehouse-locations?warehouseId=${warehouseId}`,
    ).then(setWarehouseLocationOptions);
    apiFetch<SupplierReturn[]>(
      `/materials/supplier-returns?warehouseId=${warehouseId}`,
    ).then(setSupplierReturns);
    apiFetch<StockReservation[]>(
      `/materials/stock-reservations?warehouseId=${warehouseId}`,
    ).then(setReservations);
  }

  function loadCounts() {
    apiFetch<StockCount[]>(
      `/materials/stock/counts?warehouseId=${warehouseId}`,
    ).then(setCounts);
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

  async function loadMoreStockTransfers() {
    if (!stockTransfers || stockTransfers.length === 0) return;
    setStockTransfersLoadMoreBusy(true);
    try {
      const page = await apiFetch<StockTransfer[]>(
        `/materials/stock-transfers?warehouseId=${warehouseId}&cursor=${stockTransfers[stockTransfers.length - 1].id}`,
      );
      setStockTransfers([...stockTransfers, ...page]);
      setStockTransfersHasMore(page.length === STOCK_TRANSFERS_PAGE_SIZE);
    } finally {
      setStockTransfersLoadMoreBusy(false);
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
        setReservationForm((r) => ({ ...r, materialCatalogItemId: items[0].id }));
        setSupplierReturnLines([{ materialCatalogItemId: items[0].id, quantity: "1" }]);
      }
    });
    apiFetch<Supplier[]>("/materials/suppliers").then((s) => {
      setSuppliers(s);
      if (s[0]) setSupplierReturnForm((f) => ({ ...f, supplierId: s[0].id }));
    });
    apiFetch<{ id: string; name: string }[]>("/materials/stock-kits").then((kits) => {
      setStockKits(kits);
      if (kits[0]) setAssembleForm((f) => ({ ...f, kitId: kits[0].id }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId]);

  useEffect(() => {
    if (supplierReturnForm.supplierId) {
      apiFetch<SupplierReturnPO[]>(
        `/materials/purchase-orders?supplierId=${supplierReturnForm.supplierId}`,
      ).then((pos) => {
        setSupplierReturnPOs(pos);
        setSupplierReturnForm((f) => ({ ...f, purchaseOrderId: pos[0]?.id ?? "" }));
      });
    } else {
      resetStateInEffect(() => setSupplierReturnPOs([]));
    }
  }, [supplierReturnForm.supplierId]);

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
    await apiFetch(
      `/materials/stock/counts/${activeCount.id}/lines/${lineId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ countedQuantity: Number(countedQuantity) }),
      },
    );
    setActiveCount((c) =>
      c
        ? {
            ...c,
            lines: c.lines.map((l) =>
              l.id === lineId ? { ...l, countedQuantity } : l,
            ),
          }
        : c,
    );
  }

  async function finalizeCount() {
    if (!activeCount) return;
    setBusy(true);
    try {
      await apiFetch(`/materials/stock/counts/${activeCount.id}/finalize`, {
        method: "POST",
      });
      setActiveCount(null);
      loadCounts();
      load();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!transfer.toWarehouseId && otherWarehouses[0]) {
      resetStateInEffect(() =>
        setTransfer((tr) => ({ ...tr, toWarehouseId: otherWarehouses[0].id })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherWarehouses[0]?.id]);

  const movementMaterial = materials.find(
    (m) => m.id === movement.materialCatalogItemId,
  );

  function loadAvailableSerialUnits(materialCatalogItemId: string) {
    apiFetch<SerialUnit[]>(
      `/materials/stock/serial-units?warehouseId=${warehouseId}&materialCatalogItemId=${materialCatalogItemId}`,
    ).then(setAvailableSerialUnits);
  }

  useEffect(() => {
    if (movementMaterial?.serialTracked && movement.type !== "receipt") {
      loadAvailableSerialUnits(movementMaterial.id);
    } else {
      resetStateInEffect(() => setAvailableSerialUnits([]));
    }
    resetStateInEffect(() => setSelectedUnitIds([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movementMaterial?.id, movement.type]);

  async function recordMovement(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const serialTracked = !!movementMaterial?.serialTracked;
      await apiFetch("/materials/stock/movements", {
        method: "POST",
        body: JSON.stringify({
          warehouseId,
          materialCatalogItemId: movement.materialCatalogItemId,
          type: movement.type,
          quantity: Number(movement.quantity),
          unitCost:
            movement.type === "receipt" && movement.unitCost
              ? Number(movement.unitCost)
              : undefined,
          serialNumbers:
            serialTracked && movement.type === "receipt"
              ? serialNumberDrafts.filter((s) => s.trim())
              : undefined,
          unitIds:
            serialTracked && movement.type !== "receipt" && selectedUnitIds.length > 0
              ? selectedUnitIds
              : undefined,
        }),
      });
      setMovement((m) => ({ ...m, unitCost: "" }));
      setSerialNumberDrafts([""]);
      setSelectedUnitIds([]);
      if (serialTracked && movement.type !== "receipt") {
        loadAvailableSerialUnits(movement.materialCatalogItemId);
      }
      load();
    } finally {
      setBusy(false);
    }
  }

  async function saveBinLocationRef(materialCatalogItemId: string, binLocationId: string) {
    setBusy(true);
    try {
      await apiFetch("/materials/stock/bin-location-ref", {
        method: "POST",
        body: JSON.stringify({
          warehouseId,
          materialCatalogItemId,
          binLocationId: binLocationId || null,
        }),
      });
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
        body: JSON.stringify({
          warehouseId,
          materialCatalogItemId,
          binLocation: binDraft || null,
        }),
      });
      setEditingBinFor(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  function addSupplierReturnLine() {
    if (materials.length === 0) return;
    setSupplierReturnLines((l) => [...l, { materialCatalogItemId: materials[0].id, quantity: "1" }]);
  }

  async function createSupplierReturn(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierReturnForm.purchaseOrderId || supplierReturnLines.length === 0) return;
    setBusy(true);
    try {
      await apiFetch("/materials/supplier-returns", {
        method: "POST",
        body: JSON.stringify({
          supplierId: supplierReturnForm.supplierId,
          purchaseOrderId: supplierReturnForm.purchaseOrderId,
          warehouseId,
          reason: supplierReturnForm.reason,
          notes: supplierReturnForm.notes || undefined,
          lines: supplierReturnLines.map((l) => ({
            materialCatalogItemId: l.materialCatalogItemId,
            quantity: Number(l.quantity),
          })),
        }),
      });
      setSupplierReturnForm((f) => ({ ...f, notes: "" }));
      setSupplierReturnLines(
        materials[0] ? [{ materialCatalogItemId: materials[0].id, quantity: "1" }] : [],
      );
      load();
    } finally {
      setBusy(false);
    }
  }

  async function sendSupplierReturn(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/materials/supplier-returns/${id}/send`, { method: "POST" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmSupplierReturn(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/materials/supplier-returns/${id}/confirm`, { method: "POST" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function assembleKit() {
    if (!assembleForm.kitId) return;
    setBusy(true);
    try {
      await apiFetch(`/materials/stock-kits/${assembleForm.kitId}/assemble`, {
        method: "POST",
        body: JSON.stringify({ warehouseId, quantity: Number(assembleForm.quantity) }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function disassembleKit() {
    if (!assembleForm.kitId) return;
    setBusy(true);
    try {
      await apiFetch(`/materials/stock-kits/${assembleForm.kitId}/disassemble`, {
        method: "POST",
        body: JSON.stringify({ warehouseId, quantity: Number(assembleForm.quantity) }),
      });
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
      const result = await apiFetch<BarcodeLookupResult>(
        `/materials/catalog/by-barcode/${encodeURIComponent(barcodeInput.trim())}`,
      );
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
      await apiFetch(`/materials/stock-transfers/${id}/receive`, {
        method: "POST",
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function cancelStockTransfer(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/materials/stock-transfers/${id}/cancel`, {
        method: "POST",
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function createReservation(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/materials/stock-reservations", {
        method: "POST",
        body: JSON.stringify({
          warehouseId,
          materialCatalogItemId: reservationForm.materialCatalogItemId,
          quantity: Number(reservationForm.quantity),
          note: reservationForm.note || undefined,
        }),
      });
      setReservationForm((r) => ({ ...r, note: "" }));
      load();
    } finally {
      setBusy(false);
    }
  }

  async function releaseReservation(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/materials/stock-reservations/${id}/release`, {
        method: "POST",
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
        {t("scanBarcode")}
      </h2>
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
      {barcodeError && (
        <p className="mt-1 text-xs text-error-600">{barcodeError}</p>
      )}
      {barcodeResult && (
        <div className="mt-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-sm">
          <p className="font-medium text-gray-900 dark:text-gray-50">
            {barcodeResult.name} ({barcodeResult.code})
          </p>
          {barcodeResult.stockLevels.length === 0 ? (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {t("noStockAnywhere")}
            </p>
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

      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">
        {t("stockLevels")}
      </h2>
      {!levels ? (
        <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-2">{t("material")}</th>
                <th>{t("quantity")}</th>
                <th>{t("reserved")}</th>
                <th>{t("available")}</th>
                <th>{t("bin")}</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-gray-100 dark:border-gray-700"
                >
                  <td className="py-2">
                    {l.materialCatalogItem.name} ({l.materialCatalogItem.code})
                  </td>
                  <td
                    className={
                      Number(l.quantityOnHand) < 0 ? "text-red-600" : ""
                    }
                  >
                    {l.quantityOnHand} {l.materialCatalogItem.unit}
                  </td>
                  <td className="text-gray-500 dark:text-gray-400">
                    {l.reserved > 0 ? `${l.reserved} ${l.materialCatalogItem.unit}` : "—"}
                  </td>
                  <td className={l.available < 0 ? "text-red-600" : ""}>
                    {l.available} {l.materialCatalogItem.unit}
                  </td>
                  <td>
                    {warehouseLocationOptions.length > 0 ? (
                      <select
                        className="input w-auto py-0.5 text-xs"
                        value={l.binLocationId ?? ""}
                        onChange={(e) =>
                          saveBinLocationRef(l.materialCatalogItem.id, e.target.value)
                        }
                      >
                        <option value="">{t("setBin")}</option>
                        {warehouseLocationOptions.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {t(loc.kind)} {loc.code}
                          </option>
                        ))}
                      </select>
                    ) : editingBinFor === l.materialCatalogItem.id ? (
                      <span className="flex items-center gap-1">
                        <input
                          autoFocus
                          className="input w-24 py-0.5 text-xs"
                          value={binDraft}
                          onChange={(e) => setBinDraft(e.target.value)}
                        />
                        <button
                          onClick={() =>
                            saveBinLocation(l.materialCatalogItem.id)
                          }
                          disabled={busy}
                          className="btn-primary px-1.5 py-0.5 text-xs"
                        >
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

      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">
        {t("reservations")}
      </h2>
      <form onSubmit={createReservation} className="flex flex-wrap items-end gap-2">
        <MaterialPicker
          id="reservation-material"
          materials={materials}
          value={reservationForm.materialCatalogItemId}
          onChange={(id) =>
            setReservationForm((r) => ({ ...r, materialCatalogItemId: id }))
          }
        />
        <input
          type="number"
          step="0.01"
          className="input w-24"
          value={reservationForm.quantity}
          onChange={(e) =>
            setReservationForm((r) => ({ ...r, quantity: e.target.value }))
          }
        />
        <input
          placeholder={t("reservationNotePlaceholder")}
          className="input w-48"
          value={reservationForm.note}
          onChange={(e) =>
            setReservationForm((r) => ({ ...r, note: e.target.value }))
          }
        />
        <button type="submit" disabled={busy} className="btn-secondary">
          {t("newReservation")}
        </button>
      </form>

      {reservations && reservations.filter((r) => r.status === "active").length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-2">{t("material")}</th>
                <th>{t("quantity")}</th>
                <th>{t("movementProject")}</th>
                <th>{t("note")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reservations
                .filter((r) => r.status === "active")
                .map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2">{r.materialCatalogItem.name}</td>
                    <td>
                      {r.quantity} {r.materialCatalogItem.unit}
                    </td>
                    <td>
                      {r.project ? (
                        <Link
                          href={`/projects/${r.project.id}`}
                          className="text-brand-700 dark:text-brand-400 hover:underline"
                        >
                          {r.project.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-xs text-gray-500 dark:text-gray-400">{r.note ?? "—"}</td>
                    <td className="text-right">
                      <button
                        onClick={() => releaseReservation(r.id)}
                        disabled={busy}
                        className="text-xs text-gray-400 dark:text-gray-500 hover:text-error-600"
                      >
                        {t("releaseReservation")}
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {valuation && valuation.rows.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
            {t("inventoryValuation")}
          </h2>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            {t("inventoryValuationHint", {
              method: t(`costingMethod_${valuation.method}`),
            })}
          </p>
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
                  <tr
                    key={row.materialCatalogItemId}
                    className="border-b border-gray-100 dark:border-gray-700"
                  >
                    <td className="py-2">{row.materialName}</td>
                    <td>
                      {row.quantity} {row.unit}
                    </td>
                    <td className="text-right">
                      {row.unitValue !== null
                        ? `${row.unitValue.toFixed(4)} ${currency}`
                        : "—"}
                    </td>
                    <td className="text-right font-medium">
                      {row.totalValue.toFixed(2)} {currency}
                    </td>
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

      {standardCostVariance && standardCostVariance.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            {t("standardCostVariance")}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="py-2">{t("material")}</th>
                  <th className="text-right">{t("standardCost")}</th>
                  <th className="text-right">{t("unitValue")}</th>
                  <th className="text-right">{t("variance")}</th>
                </tr>
              </thead>
              <tbody>
                {standardCostVariance.map((row) => (
                  <tr key={row.materialCatalogItemId} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2">{row.materialName}</td>
                    <td className="text-right">
                      {row.standardCost.toFixed(4)} {currency}
                    </td>
                    <td className="text-right">
                      {row.unitValue !== null ? `${row.unitValue.toFixed(4)} ${currency}` : "—"}
                    </td>
                    <td
                      className={`text-right font-medium ${
                        row.varianceAmount > 0
                          ? "text-error-600"
                          : row.varianceAmount < 0
                            ? "text-success-700 dark:text-success-500"
                            : ""
                      }`}
                    >
                      {row.varianceAmount > 0 ? "+" : ""}
                      {row.varianceAmount.toFixed(4)} {currency}
                      {row.variancePercent !== null && (
                        <span className="ml-1 text-xs">
                          ({row.variancePercent > 0 ? "+" : ""}
                          {row.variancePercent.toFixed(1)}%)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">
        {t("recordMovement")}
      </h2>
      <form
        onSubmit={recordMovement}
        className="flex flex-wrap items-end gap-2"
      >
        <MaterialPicker
          id="movement-material"
          materials={materials}
          value={movement.materialCatalogItemId}
          onChange={(id) =>
            setMovement((m) => ({ ...m, materialCatalogItemId: id }))
          }
        />
        <select
          className="input w-auto"
          value={movement.type}
          onChange={(e) =>
            setMovement((m) => ({
              ...m,
              type: e.target.value as (typeof GENERIC_MOVEMENT_TYPES)[number],
            }))
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
          onChange={(e) =>
            setMovement((m) => ({ ...m, quantity: e.target.value }))
          }
        />
        {movement.type === "receipt" && (
          <input
            type="number"
            step="0.0001"
            min="0"
            placeholder={t("unitCostPlaceholder")}
            className="input w-32"
            value={movement.unitCost}
            onChange={(e) =>
              setMovement((m) => ({ ...m, unitCost: e.target.value }))
            }
          />
        )}
        <button type="submit" disabled={busy} className="btn-secondary">
          {tc("save")}
        </button>

        {movementMaterial?.serialTracked && movement.type === "receipt" && (
          <div className="mt-2 flex w-full flex-col gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t("serialNumbers")}
              {Number(movement.quantity) !== serialNumberDrafts.filter((s) => s.trim()).length && (
                <span className="ml-2 text-error-600">{t("unitCountMismatch")}</span>
              )}
            </span>
            {serialNumberDrafts.map((sn, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  className="input w-40"
                  placeholder={`SN-${i + 1}`}
                  value={sn}
                  onChange={(e) =>
                    setSerialNumberDrafts((d) =>
                      d.map((v, idx) => (idx === i ? e.target.value : v)),
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    setSerialNumberDrafts((d) => d.filter((_, idx) => idx !== i))
                  }
                  className="text-xs text-gray-400 hover:text-error-600"
                >
                  {tc("delete")}
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setSerialNumberDrafts((d) => [...d, ""])}
              className="btn-secondary w-fit px-2 py-1 text-xs"
            >
              {t("addSerialNumber")}
            </button>
          </div>
        )}

        {movementMaterial?.serialTracked && movement.type !== "receipt" && (
          <div className="mt-2 flex w-full flex-col gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t("selectUnits")}
              {selectedUnitIds.length > 0 &&
                Number(movement.quantity) !== selectedUnitIds.length && (
                  <span className="ml-2 text-error-600">{t("unitCountMismatch")}</span>
                )}
            </span>
            {availableSerialUnits.length === 0 ? (
              <span className="text-xs text-gray-400 dark:text-gray-500">{t("noAvailableUnits")}</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableSerialUnits.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={selectedUnitIds.includes(u.id)}
                      onChange={(e) =>
                        setSelectedUnitIds((ids) =>
                          e.target.checked
                            ? [...ids, u.id]
                            : ids.filter((id) => id !== u.id),
                        )
                      }
                    />
                    {u.serialNumber}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </form>

      {movements && movements.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            {t("movementHistory")}
          </h2>
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
                  <tr
                    key={mv.id}
                    className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300"
                  >
                    <td className="py-1.5">
                      {mv.materialCatalogItem.name} (
                      {mv.materialCatalogItem.code})
                    </td>
                    <td>{t(mv.type)}</td>
                    <td>
                      {mv.quantity} {mv.materialCatalogItem.unit}
                    </td>
                    <td>
                      {mv.project ? (
                        <Link
                          href={`/projects/${mv.project.id}`}
                          className="text-brand-700 dark:text-brand-400 hover:underline"
                        >
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
            <button
              onClick={loadMoreMovements}
              disabled={movementsLoadMoreBusy}
              className="btn-secondary mt-3 px-2.5 py-1 text-xs"
            >
              {t("loadMoreMovements")}
            </button>
          )}
        </div>
      )}

      {otherWarehouses.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">
            {t("transferStock")}
          </h2>
          <form
            onSubmit={recordTransfer}
            className="flex flex-wrap items-end gap-2"
          >
            <MaterialPicker
              id="transfer-material"
              materials={materials}
              value={transfer.materialCatalogItemId}
              onChange={(id) =>
                setTransfer((tr) => ({ ...tr, materialCatalogItemId: id }))
              }
            />
            <span className="pb-2.5 text-sm text-gray-400 dark:text-gray-500">
              →
            </span>
            <select
              className="input w-auto"
              value={transfer.toWarehouseId}
              onChange={(e) =>
                setTransfer((tr) => ({ ...tr, toWarehouseId: e.target.value }))
              }
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
              onChange={(e) =>
                setTransfer((tr) => ({ ...tr, quantity: e.target.value }))
              }
            />
            <button type="submit" disabled={busy} className="btn-secondary">
              {t("transfer")}
            </button>
          </form>

          <h2 className="mb-1 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">
            {t("inTransitTransfer")}
          </h2>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            {t("inTransitTransferHint")}
          </p>
          <form
            onSubmit={initiateStockTransfer}
            className="flex flex-wrap items-end gap-2"
          >
            <MaterialPicker
              id="in-transit-material"
              materials={materials}
              value={inTransitForm.materialCatalogItemId}
              onChange={(id) =>
                setInTransitForm((f) => ({ ...f, materialCatalogItemId: id }))
              }
            />
            <span className="pb-2.5 text-sm text-gray-400 dark:text-gray-500">
              →
            </span>
            <select
              className="input w-auto"
              value={inTransitForm.toWarehouseId}
              onChange={(e) =>
                setInTransitForm((f) => ({
                  ...f,
                  toWarehouseId: e.target.value,
                }))
              }
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
              onChange={(e) =>
                setInTransitForm((f) => ({ ...f, quantity: e.target.value }))
              }
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
                  <tr
                    key={tr.id}
                    className="border-b border-gray-100 dark:border-gray-700"
                  >
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
                      {tr.status === "in_transit" &&
                        tr.toWarehouse.id === warehouseId && (
                          <button
                            onClick={() => receiveStockTransfer(tr.id)}
                            disabled={busy}
                            className="btn-secondary px-2 py-1 text-xs"
                          >
                            {t("receiveTransfer")}
                          </button>
                        )}
                      {tr.status === "in_transit" &&
                        tr.fromWarehouse.id === warehouseId && (
                          <button
                            onClick={() => cancelStockTransfer(tr.id)}
                            disabled={busy}
                            className="ml-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-error-600"
                          >
                            {tc("cancel")}
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stockTransfersHasMore && (
              <button
                onClick={loadMoreStockTransfers}
                disabled={stockTransfersLoadMoreBusy}
                className="btn-secondary mt-3 px-2.5 py-1 text-xs"
              >
                {tc("loadMore")}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {t("stockCounts")}
        </h2>
        <button
          onClick={startCount}
          disabled={busy}
          className="btn-secondary px-3 py-1 text-xs"
        >
          {t("startCount")}
        </button>
      </div>

      {counts && counts.length > 0 && !activeCount && (
        <ul className="flex flex-col gap-2">
          {counts.map((c) => {
            const varianceCount = c.lines.filter(
              (l) => l.countedQuantity !== l.systemQuantity,
            ).length;
            return (
              <li key={c.id}>
                <button
                  onClick={() => viewCount(c.id)}
                  className="card flex w-full items-center justify-between text-left hover:border-gray-400"
                >
                  <span className="text-sm">
                    {formatDate(new Date(c.createdAt))}
                  </span>
                  <span className="flex items-center gap-2 text-xs">
                    {varianceCount > 0 && (
                      <span className="text-warning-700 dark:text-warning-500">
                        {t("variances", { count: varianceCount })}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        c.status === "finalized"
                          ? "bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-400"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
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
          <button
            onClick={() => setActiveCount(null)}
            className="mb-2 text-xs text-gray-500 dark:text-gray-400 hover:underline"
          >
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
                  const variance =
                    Number(lineInputs[line.id] ?? line.countedQuantity) -
                    Number(line.systemQuantity);
                  return (
                    <tr
                      key={line.id}
                      className="border-b border-gray-100 dark:border-gray-700"
                    >
                      <td className="py-1.5">
                        {line.materialCatalogItem.name} (
                        {line.materialCatalogItem.code})
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
                            onChange={(e) =>
                              setLineInputs((li) => ({
                                ...li,
                                [line.id]: e.target.value,
                              }))
                            }
                            onBlur={(e) => saveLine(line.id, e.target.value)}
                          />
                        ) : (
                          <span>
                            {line.countedQuantity}{" "}
                            {line.materialCatalogItem.unit}
                          </span>
                        )}
                      </td>
                      <td
                        className={
                          variance === 0
                            ? "text-gray-400 dark:text-gray-500"
                            : variance > 0
                              ? "text-success-700 dark:text-success-500"
                              : "text-error-600"
                        }
                      >
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
            <button
              onClick={finalizeCount}
              disabled={busy}
              className="btn-primary mt-3"
            >
              {t("finalizeCount")}
            </button>
          )}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">
        {t("supplierReturns")}
      </h2>
      <form onSubmit={createSupplierReturn} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <select
            className="input w-auto"
            value={supplierReturnForm.supplierId}
            onChange={(e) =>
              setSupplierReturnForm((f) => ({ ...f, supplierId: e.target.value }))
            }
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            className="input w-auto"
            value={supplierReturnForm.purchaseOrderId}
            onChange={(e) =>
              setSupplierReturnForm((f) => ({ ...f, purchaseOrderId: e.target.value }))
            }
          >
            {supplierReturnPOs.length === 0 && <option value="">—</option>}
            {supplierReturnPOs.map((po) => (
              <option key={po.id} value={po.id}>
                PO {po.id.slice(0, 8)} ({po.status})
              </option>
            ))}
          </select>
          <select
            className="input w-auto"
            value={supplierReturnForm.reason}
            onChange={(e) =>
              setSupplierReturnForm((f) => ({
                ...f,
                reason: e.target.value as (typeof SUPPLIER_RETURN_REASONS)[number],
              }))
            }
          >
            {SUPPLIER_RETURN_REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`returnReason_${r}`)}
              </option>
            ))}
          </select>
          <input
            placeholder={t("note")}
            className="input w-48"
            value={supplierReturnForm.notes}
            onChange={(e) =>
              setSupplierReturnForm((f) => ({ ...f, notes: e.target.value }))
            }
          />
        </div>

        {supplierReturnLines.map((line, i) => (
          <div key={i} className="flex items-center gap-2">
            <MaterialPicker
              id={`supplier-return-material-${i}`}
              materials={materials}
              value={line.materialCatalogItemId}
              onChange={(id) =>
                setSupplierReturnLines((ls) =>
                  ls.map((l, idx) => (idx === i ? { ...l, materialCatalogItemId: id } : l)),
                )
              }
            />
            <input
              type="number"
              step="0.01"
              className="input w-24"
              value={line.quantity}
              onChange={(e) =>
                setSupplierReturnLines((ls) =>
                  ls.map((l, idx) => (idx === i ? { ...l, quantity: e.target.value } : l)),
                )
              }
            />
            <button
              type="button"
              onClick={() => setSupplierReturnLines((ls) => ls.filter((_, idx) => idx !== i))}
              className="text-xs text-gray-400 hover:text-error-600"
            >
              {tc("delete")}
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <button type="button" onClick={addSupplierReturnLine} className="btn-secondary w-fit px-2 py-1 text-xs">
            {t("addLine")}
          </button>
          <button type="submit" disabled={busy || !supplierReturnForm.purchaseOrderId} className="btn-primary w-fit">
            {t("newSupplierReturn")}
          </button>
        </div>
      </form>

      {supplierReturns && supplierReturns.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-2">{t("material")}</th>
                <th>{tc("status")}</th>
                <th>{t("returnReasonLabel")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {supplierReturns.map((sr) => (
                <tr key={sr.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">
                    {sr.supplier.name} —{" "}
                    {sr.lines.map((l) => `${l.materialCatalogItem.name} (${l.quantity} ${l.materialCatalogItem.unit})`).join(", ")}
                  </td>
                  <td>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        sr.status === "draft"
                          ? "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                          : sr.status === "sent"
                            ? "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400"
                            : "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500"
                      }`}
                    >
                      {t(`returnStatus_${sr.status}`)}
                    </span>
                  </td>
                  <td className="text-xs text-gray-500 dark:text-gray-400">{t(`returnReason_${sr.reason}`)}</td>
                  <td className="text-right">
                    {sr.status === "draft" && (
                      <button onClick={() => sendSupplierReturn(sr.id)} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                        {t("sendReturn")}
                      </button>
                    )}
                    {sr.status === "sent" && (
                      <button onClick={() => confirmSupplierReturn(sr.id)} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                        {t("confirmReturn")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {stockKits.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">
            {t("kit")}
          </h2>
          <div className="flex flex-wrap items-end gap-2">
            <select
              className="input w-auto"
              value={assembleForm.kitId}
              onChange={(e) => setAssembleForm((f) => ({ ...f, kitId: e.target.value }))}
            >
              {stockKits.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              className="input w-24"
              value={assembleForm.quantity}
              onChange={(e) => setAssembleForm((f) => ({ ...f, quantity: e.target.value }))}
            />
            <button type="button" onClick={assembleKit} disabled={busy} className="btn-primary">
              {t("assembleKit")}
            </button>
            <button type="button" onClick={disassembleKit} disabled={busy} className="btn-secondary">
              {t("disassembleKit")}
            </button>
          </div>
        </>
      )}

      <WarehouseLocations warehouseId={warehouseId} />
    </div>
  );
}
