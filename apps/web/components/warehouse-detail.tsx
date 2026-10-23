"use client";

import { useEffect, useState } from "react";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { WarehouseLocations } from "@/components/warehouse-locations";
import { WarehouseDetailContext } from "@/components/warehouse-detail/context";
import type { MaterialCatalogItem, Warehouse } from "@/components/warehouse-detail/types";
import { BarcodeLookup } from "@/components/warehouse-detail/barcode-lookup";
import { StockLevels } from "@/components/warehouse-detail/stock-levels";
import { Reservations } from "@/components/warehouse-detail/reservations";
import { InventoryValuation } from "@/components/warehouse-detail/inventory-valuation";
import { StandardCostVariance } from "@/components/warehouse-detail/standard-cost-variance";
import { RecordMovement } from "@/components/warehouse-detail/record-movement";
import { MovementHistory } from "@/components/warehouse-detail/movement-history";
import { StockTransfers } from "@/components/warehouse-detail/stock-transfers";
import { StockCounts } from "@/components/warehouse-detail/stock-counts";
import { SupplierReturns } from "@/components/warehouse-detail/supplier-returns";
import { StockKits } from "@/components/warehouse-detail/stock-kits";

/**
 * One warehouse: its sections (components/warehouse-detail/*) each load and change their own data;
 * this shares the material catalog, one busy flag for every action, and the refresh after a change.
 */
export function WarehouseDetail({
  warehouseId,
  allWarehouses,
}: {
  warehouseId: string;
  allWarehouses: Warehouse[];
}) {
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";
  const [materials, setMaterials] = useState<MaterialCatalogItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    apiFetch<MaterialCatalogItem[]>("/materials/catalog").then(setMaterials).catch(notifyApiError);
  }, [warehouseId]);

  const otherWarehouses = allWarehouses.filter((w) => w.id !== warehouseId);

  return (
    <WarehouseDetailContext.Provider
      value={{ warehouseId, otherWarehouses, materials, currency, version, busy, setBusy, refresh: () => setVersion((v) => v + 1) }}
    >
      <div>
        <BarcodeLookup />
        <StockLevels />
        <Reservations />
        <InventoryValuation />
        <StandardCostVariance />
        <RecordMovement />
        <MovementHistory />
        <StockTransfers />
        <StockCounts />
        <SupplierReturns />
        <StockKits />
        <WarehouseLocations warehouseId={warehouseId} />
      </div>
    </WarehouseDetailContext.Provider>
  );
}
