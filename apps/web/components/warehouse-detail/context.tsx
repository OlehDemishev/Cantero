"use client";

import { createContext, useContext } from "react";
import type { MaterialCatalogItem, Warehouse } from "./types";

export interface WarehouseDetailContextValue {
  warehouseId: string;
  /** Every other warehouse: where stock can be sent. */
  otherWarehouses: Warehouse[];
  /** The material catalog, for the pickers. */
  materials: MaterialCatalogItem[];
  currency: string;
  /** Bumped by `refresh`: each section loads what it shows again when it moves. */
  version: number;
  /** One change at a time for the whole warehouse: every action is disabled while one runs. */
  busy: boolean;
  setBusy: (busy: boolean) => void;
  /** After a change: the stock levels again, and everything else this warehouse shows. */
  refresh: () => void;
}

export const WarehouseDetailContext = createContext<WarehouseDetailContextValue | null>(null);

export function useWarehouseDetail(): WarehouseDetailContextValue {
  const value = useContext(WarehouseDetailContext);
  if (!value) throw new Error("useWarehouseDetail outside WarehouseDetail");
  return value;
}
