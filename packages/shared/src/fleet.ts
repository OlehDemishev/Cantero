import { z } from "zod";

export const VEHICLE_TYPES = ["truck", "van", "trailer", "other"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_INSPECTION_RESULTS = ["passed", "failed"] as const;
export type VehicleInspectionResult = (typeof VEHICLE_INSPECTION_RESULTS)[number];

export const createVehicleSchema = z.object({
  name: z.string().min(1).max(160),
  vin: z.string().max(40).optional(),
  licensePlate: z.string().max(30).optional(),
  type: z.enum(VEHICLE_TYPES).optional(),
  assignedDriverId: z.string().uuid().optional(),
  registrationExpiresAt: z.string().datetime().optional(),
  insuranceExpiresAt: z.string().datetime().optional(),
  odometerMiles: z.number().nonnegative().optional(),
});
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

export const updateVehicleSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  vin: z.string().max(40).nullable().optional(),
  licensePlate: z.string().max(30).nullable().optional(),
  type: z.enum(VEHICLE_TYPES).optional(),
  assignedDriverId: z.string().uuid().nullable().optional(),
  registrationExpiresAt: z.string().datetime().nullable().optional(),
  insuranceExpiresAt: z.string().datetime().nullable().optional(),
  odometerMiles: z.number().nonnegative().nullable().optional(),
});
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

export const logVehicleInspectionSchema = z.object({
  result: z.enum(VEHICLE_INSPECTION_RESULTS),
  inspectorName: z.string().max(160).optional(),
  notes: z.string().max(2000).optional(),
});
export type LogVehicleInspectionInput = z.infer<typeof logVehicleInspectionSchema>;

export const setDriverCdlExpirySchema = z.object({
  cdlExpiresAt: z.string().datetime().nullable(),
});
export type SetDriverCdlExpiryInput = z.infer<typeof setDriverCdlExpirySchema>;
