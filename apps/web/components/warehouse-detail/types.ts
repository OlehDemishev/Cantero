/** Shapes the warehouse detail sections read from the API. */
export interface Warehouse {
  id: string;
  name: string;
}
export interface MaterialCatalogItem {
  id: string;
  code: string;
  name: string;
  serialTracked?: boolean;
}
export interface SerialUnit {
  id: string;
  serialNumber: string;
}
export interface StockLevel {
  id: string;
  quantityOnHand: string;
  binLocation: string | null;
  binLocationId: string | null;
  reserved: number;
  available: number;
  materialCatalogItem: MaterialCatalogItem & { unit: string };
  warehouse: { id: string };
}
export interface WarehouseLocationOption {
  id: string;
  kind: "zone" | "aisle" | "rack" | "bin";
  code: string;
}
export interface StockReservation {
  id: string;
  quantity: string;
  note: string | null;
  status: "active" | "released";
  createdByName: string;
  createdAt: string;
  materialCatalogItem: { id: string; name: string; unit: string };
  project: { id: string; name: string } | null;
}
export interface BarcodeStockLevel {
  warehouse: { id: string; name: string };
  quantityOnHand: string;
  binLocation: string | null;
}
export interface BarcodeLookupResult {
  id: string;
  code: string;
  name: string;
  unit: string;
  stockLevels: BarcodeStockLevel[];
}
export interface StockCountLine {
  id: string;
  materialCatalogItemId: string;
  systemQuantity: string;
  countedQuantity: string;
  materialCatalogItem: { code: string; name: string; unit: string };
}
export interface StockCount {
  id: string;
  status: "draft" | "finalized";
  createdAt: string;
  finalizedAt: string | null;
  lines: StockCountLine[];
}
export interface StockTransfer {
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
export interface StockMovement {
  id: string;
  type: "receipt" | "issue" | "transfer" | "write_off";
  quantity: string;
  unitCost: string | null;
  createdAt: string;
  materialCatalogItem: { id: string; code: string; name: string; unit: string };
  project: { id: string; name: string } | null;
}
export interface InventoryValuationRow {
  warehouseId: string;
  materialCatalogItemId: string;
  materialName: string;
  unit: string;
  quantity: number;
  unitValue: number | null;
  totalValue: number;
}
export interface InventoryValuation {
  method: "fifo" | "weighted_average";
  rows: InventoryValuationRow[];
  totalValue: number;
}
export interface StandardCostVarianceRow {
  materialCatalogItemId: string;
  materialName: string;
  unit: string;
  unitValue: number | null;
  standardCost: number;
  varianceAmount: number;
  variancePercent: number | null;
}
export interface Supplier {
  id: string;
  name: string;
}
export interface SupplierReturnPO {
  id: string;
  status: string;
}
export interface SupplierReturn {
  id: string;
  reason: "defective" | "wrong_item" | "overstock" | "damaged_in_transit" | "other";
  notes: string | null;
  status: "draft" | "sent" | "confirmed";
  createdAt: string;
  supplier: { id: string; name: string };
  purchaseOrder: { id: string };
  lines: { id: string; quantity: string; materialCatalogItem: { id: string; name: string; unit: string } }[];
}

export const GENERIC_MOVEMENT_TYPES = ["receipt", "issue", "write_off"] as const;
export const SUPPLIER_RETURN_REASONS = ["defective", "wrong_item", "overstock", "damaged_in_transit", "other"] as const;
