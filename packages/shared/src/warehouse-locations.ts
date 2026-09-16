import { z } from "zod";

export const WAREHOUSE_LOCATION_KINDS = ["zone", "aisle", "rack", "bin"] as const;
export type WarehouseLocationKind = (typeof WAREHOUSE_LOCATION_KINDS)[number];

export const createWarehouseLocationSchema = z.object({
  warehouseId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
  kind: z.enum(WAREHOUSE_LOCATION_KINDS),
  code: z.string().min(1).max(40),
});
export type CreateWarehouseLocationInput = z.infer<typeof createWarehouseLocationSchema>;

export const setBinLocationRefSchema = z.object({
  warehouseId: z.string().uuid(),
  materialCatalogItemId: z.string().uuid(),
  binLocationId: z.string().uuid().nullable(),
});
export type SetBinLocationRefInput = z.infer<typeof setBinLocationRefSchema>;
