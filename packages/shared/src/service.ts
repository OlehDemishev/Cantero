import { z } from "zod";

export const createServiceContractSchema = z.object({
  projectId: z.string().uuid(),
  clientId: z.string().uuid(),
  title: z.string().min(1).max(160),
  frequencyMonths: z.number().int().min(1).max(60),
  startDate: z.string().datetime(),
  notes: z.string().max(2000).optional(),
});
export type CreateServiceContractInput = z.infer<typeof createServiceContractSchema>;

export const updateServiceContractSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  frequencyMonths: z.number().int().min(1).max(60).optional(),
  active: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdateServiceContractInput = z.infer<typeof updateServiceContractSchema>;

export const scheduleServiceVisitSchema = z.object({
  scheduledDate: z.string().datetime(),
  technicianWorkerId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});
export type ScheduleServiceVisitInput = z.infer<typeof scheduleServiceVisitSchema>;

export const completeServiceVisitSchema = z.object({
  notes: z.string().max(2000).optional(),
});
export type CompleteServiceVisitInput = z.infer<typeof completeServiceVisitSchema>;

export const submitServiceVisitFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});
export type SubmitServiceVisitFeedbackInput = z.infer<typeof submitServiceVisitFeedbackSchema>;
