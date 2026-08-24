import { z } from "zod";

export const createWorkerSchema = z.object({
  name: z.string().min(1).max(160),
  role: z.string().max(80).optional(),
  hourlyCost: z.number().nonnegative().optional(),
});
export type CreateWorkerInput = z.infer<typeof createWorkerSchema>;

export const updateWorkerSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  role: z.string().max(80).nullable().optional(),
  hourlyCost: z.number().nonnegative().nullable().optional(),
  active: z.boolean().optional(),
});
export type UpdateWorkerInput = z.infer<typeof updateWorkerSchema>;

export const createTimeEntrySchema = z.object({
  workerId: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  hours: z.number().positive().max(24),
  date: z.string().datetime(),
  /// Captured from the browser Geolocation API when logged from the field app — absent for entries logged from the office.
  clockInLat: z.number().min(-90).max(90).optional(),
  clockInLng: z.number().min(-180).max(180).optional(),
});
export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;

export const updateTimeEntrySchema = z.object({
  hours: z.number().positive().max(24).optional(),
  date: z.string().datetime().optional(),
  taskId: z.string().uuid().nullable().optional(),
});
export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntrySchema>;

export const addWorkerCertificationSchema = z.object({
  name: z.string().min(1).max(160),
  expiresAt: z.string().datetime(),
});
export type AddWorkerCertificationInput = z.infer<typeof addWorkerCertificationSchema>;
