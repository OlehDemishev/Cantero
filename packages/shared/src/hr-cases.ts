import { z } from "zod";

export const HR_CASE_CATEGORIES = ["safety_violation", "complaint", "attendance", "performance", "harassment", "other"] as const;
export type HrCaseCategory = (typeof HR_CASE_CATEGORIES)[number];

export const HR_CASE_SEVERITIES = ["low", "medium", "high"] as const;
export type HrCaseSeverity = (typeof HR_CASE_SEVERITIES)[number];

export const HR_CASE_STATUSES = ["open", "investigating", "resolved", "closed"] as const;
export type HrCaseStatus = (typeof HR_CASE_STATUSES)[number];

export const HR_CASE_ACTION_TYPES = ["coaching", "verbal_warning", "written_warning", "suspension", "termination", "note"] as const;
export type HrCaseActionType = (typeof HR_CASE_ACTION_TYPES)[number];

export const openHrCaseSchema = z.object({
  category: z.enum(HR_CASE_CATEGORIES),
  severity: z.enum(HR_CASE_SEVERITIES).optional(),
  description: z.string().min(1).max(4000),
  confidential: z.boolean().optional(),
});
export type OpenHrCaseInput = z.infer<typeof openHrCaseSchema>;

export const updateHrCaseStatusSchema = z.object({
  status: z.enum(HR_CASE_STATUSES),
});
export type UpdateHrCaseStatusInput = z.infer<typeof updateHrCaseStatusSchema>;

export const addHrCaseActionSchema = z.object({
  type: z.enum(HR_CASE_ACTION_TYPES),
  description: z.string().min(1).max(2000),
  actionDate: z.string().datetime().optional(),
});
export type AddHrCaseActionInput = z.infer<typeof addHrCaseActionSchema>;
