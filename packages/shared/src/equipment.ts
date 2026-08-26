import { z } from "zod";

export const EQUIPMENT_STATUSES = ["available", "in_use", "maintenance", "retired"] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export const createEquipmentSchema = z.object({
  name: z.string().min(1).max(160),
  category: z.string().min(1).max(80),
  serialNumber: z.string().max(120).optional(),
  purchaseDate: z.string().datetime().optional(),
  purchaseCost: z.number().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;

export const updateEquipmentSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  category: z.string().min(1).max(80).optional(),
  serialNumber: z.string().max(120).nullable().optional(),
  purchaseCost: z.number().nonnegative().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>;

export const checkOutEquipmentSchema = z
  .object({
    projectId: z.string().uuid().optional(),
    workerId: z.string().uuid().optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => !!data.projectId || !!data.workerId, {
    message: "Assign to a project, a worker, or both",
    path: ["projectId"],
  });
export type CheckOutEquipmentInput = z.infer<typeof checkOutEquipmentSchema>;

export const recordEquipmentGpsPingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type RecordEquipmentGpsPingInput = z.infer<typeof recordEquipmentGpsPingSchema>;

export const addMaintenanceRecordSchema = z.object({
  description: z.string().min(1).max(500),
  cost: z.number().nonnegative().optional(),
  performedAt: z.string().datetime().optional(),
});
export type AddMaintenanceRecordInput = z.infer<typeof addMaintenanceRecordSchema>;

export const updateMaintenanceScheduleSchema = z.object({
  intervalDays: z.number().int().min(1).max(3650).nullable(),
});
export type UpdateMaintenanceScheduleInput = z.infer<typeof updateMaintenanceScheduleSchema>;
