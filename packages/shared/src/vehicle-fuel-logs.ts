import { z } from "zod";

export const addVehicleFuelLogSchema = z.object({
  quantity: z.number().positive(),
  cost: z.number().nonnegative().optional(),
  odometerMiles: z.number().nonnegative().optional(),
  idleHours: z.number().nonnegative().optional(),
  notes: z.string().max(500).optional(),
});
export type AddVehicleFuelLogInput = z.infer<typeof addVehicleFuelLogSchema>;
