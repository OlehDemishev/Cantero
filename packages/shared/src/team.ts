import { z } from "zod";
import { SUPPORTED_LOCALES } from "./company";

export const createWorkerSchema = z.object({
  name: z.string().min(1).max(160),
  role: z.string().max(80).optional(),
  hourlyCost: z.number().nonnegative().optional(),
  wageClassificationId: z.string().uuid().optional(),
  phone: z.string().max(40).optional(),
  preferredLocale: z.enum(SUPPORTED_LOCALES).optional(),
  payrollEmployeeId: z.string().max(60).optional(),
  isApprentice: z.boolean().optional(),
});
export type CreateWorkerInput = z.infer<typeof createWorkerSchema>;

export const updateWorkerSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  role: z.string().max(80).nullable().optional(),
  hourlyCost: z.number().nonnegative().nullable().optional(),
  active: z.boolean().optional(),
  wageClassificationId: z.string().uuid().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  preferredLocale: z.enum(SUPPORTED_LOCALES).nullable().optional(),
  payrollEmployeeId: z.string().max(60).nullable().optional(),
  isApprentice: z.boolean().optional(),
});
export type UpdateWorkerInput = z.infer<typeof updateWorkerSchema>;

export const setClockInPinSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4-6 digits"),
});
export type SetClockInPinInput = z.infer<typeof setClockInPinSchema>;

export const verifyClockInPinSchema = z.object({
  pin: z.string(),
});
export type VerifyClockInPinInput = z.infer<typeof verifyClockInPinSchema>;

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

export const TIME_OFF_TYPES = ["vacation", "sick", "unpaid"] as const;
export type TimeOffType = (typeof TIME_OFF_TYPES)[number];

export const createTimeOffRequestSchema = z.object({
  workerId: z.string().uuid(),
  type: z.enum(TIME_OFF_TYPES),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  reason: z.string().max(500).optional(),
});
export type CreateTimeOffRequestInput = z.infer<typeof createTimeOffRequestSchema>;

export const decideTimeOffRequestSchema = z.object({
  approve: z.boolean(),
});
export type DecideTimeOffRequestInput = z.infer<typeof decideTimeOffRequestSchema>;

export const adjustPtoBalanceSchema = z.object({
  deltaHours: z.number().refine((n) => n !== 0, "deltaHours can't be zero"),
  reason: z.string().min(1).max(300),
});
export type AdjustPtoBalanceInput = z.infer<typeof adjustPtoBalanceSchema>;

export const createOnboardingTemplateItemSchema = z.object({
  title: z.string().min(1).max(200),
});
export type CreateOnboardingTemplateItemInput = z.infer<typeof createOnboardingTemplateItemSchema>;

export const updateOnboardingTemplateItemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdateOnboardingTemplateItemInput = z.infer<typeof updateOnboardingTemplateItemSchema>;

export const createOffboardingTemplateItemSchema = z.object({
  title: z.string().min(1).max(200),
});
export type CreateOffboardingTemplateItemInput = z.infer<typeof createOffboardingTemplateItemSchema>;

export const updateOffboardingTemplateItemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdateOffboardingTemplateItemInput = z.infer<typeof updateOffboardingTemplateItemSchema>;
