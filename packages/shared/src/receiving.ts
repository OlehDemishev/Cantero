import { z } from "zod";

export const RECEIVING_DISCREPANCY_TYPES = ["short_ship", "over_ship", "damaged", "backorder"] as const;
export type ReceivingDiscrepancyType = (typeof RECEIVING_DISCREPANCY_TYPES)[number];

export const RECEIVING_DISCREPANCY_RESOLUTIONS = ["pending", "credit_issued", "replacement_sent", "disputed"] as const;
export type ReceivingDiscrepancyResolution = (typeof RECEIVING_DISCREPANCY_RESOLUTIONS)[number];

export const receiveShipmentLineSchema = z.object({
  lineId: z.string().uuid(),
  quantityReceived: z.number().nonnegative(),
  quantityDamaged: z.number().nonnegative().optional(),
  /// A judgment call the receiver makes when a line falls short of what was ordered — "backorder"
  /// (more is coming) vs. "short_ship" (it isn't) can't be inferred from quantities alone, unlike
  /// over_ship/damaged which the service detects automatically.
  shortfallType: z.enum(["short_ship", "backorder"]).optional(),
});
export type ReceiveShipmentLineInput = z.infer<typeof receiveShipmentLineSchema>;

export const receiveShipmentSchema = z.object({
  warehouseId: z.string().uuid(),
  lines: z.array(receiveShipmentLineSchema).min(1),
});
export type ReceiveShipmentInput = z.infer<typeof receiveShipmentSchema>;

export const resolveReceivingDiscrepancySchema = z.object({
  resolution: z.enum(RECEIVING_DISCREPANCY_RESOLUTIONS),
  resolutionNotes: z.string().max(2000).optional(),
});
export type ResolveReceivingDiscrepancyInput = z.infer<typeof resolveReceivingDiscrepancySchema>;
