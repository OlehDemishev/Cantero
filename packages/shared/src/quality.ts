import { z } from "zod";

export const INSPECTION_STATUSES = ["open", "passed", "failed"] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const INSPECTION_ITEM_RESULTS = ["pending", "pass", "fail", "na"] as const;
export type InspectionItemResult = (typeof INSPECTION_ITEM_RESULTS)[number];

export const DEFICIENCY_SEVERITIES = ["minor", "major", "critical"] as const;
export type DeficiencySeverity = (typeof DEFICIENCY_SEVERITIES)[number];

export const DEFICIENCY_STATUSES = ["open", "resolved", "verified"] as const;
export type DeficiencyStatus = (typeof DEFICIENCY_STATUSES)[number];

export const inspectionTemplateItemInputSchema = z.object({
  description: z.string().min(1).max(300),
});

export const createInspectionTemplateSchema = z.object({
  name: z.string().min(1).max(160),
  trade: z.string().min(1).max(80),
  items: z.array(inspectionTemplateItemInputSchema).min(1).max(100),
});
export type CreateInspectionTemplateInput = z.infer<typeof createInspectionTemplateSchema>;

export const updateInspectionTemplateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  trade: z.string().min(1).max(80).optional(),
  items: z.array(inspectionTemplateItemInputSchema).min(1).max(100).optional(),
});
export type UpdateInspectionTemplateInput = z.infer<typeof updateInspectionTemplateSchema>;

export const createInspectionChecklistSchema = z.object({
  projectId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  name: z.string().min(1).max(160),
  trade: z.string().min(1).max(80),
  phase: z.string().max(80).optional(),
  inspectorWorkerId: z.string().uuid().optional(),
  /// Only used when no templateId is given — an ad hoc checklist's item list.
  items: z.array(inspectionTemplateItemInputSchema).max(100).optional(),
});
export type CreateInspectionChecklistInput = z.infer<typeof createInspectionChecklistSchema>;

export const recordInspectionItemResultSchema = z.object({
  result: z.enum(INSPECTION_ITEM_RESULTS),
  notes: z.string().max(1000).optional(),
});
export type RecordInspectionItemResultInput = z.infer<typeof recordInspectionItemResultSchema>;

export const createDeficiencyFromItemSchema = z.object({
  description: z.string().min(1).max(1000).optional(),
  severity: z.enum(DEFICIENCY_SEVERITIES),
  assigneeWorkerId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
  /// Free-text zone/floor/area (e.g. "3rd floor — east wing") — deliberately not a fixed
  /// taxonomy, same "free text, not enumerated" choice as PunchListItem.location, since building
  /// zone naming varies too much project to project for a shared enum to hold up.
  location: z.string().max(160).optional(),
});
export type CreateDeficiencyFromItemInput = z.infer<typeof createDeficiencyFromItemSchema>;

export const updateDeficiencySchema = z.object({
  description: z.string().min(1).max(1000).optional(),
  severity: z.enum(DEFICIENCY_SEVERITIES).optional(),
  assigneeWorkerId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  location: z.string().max(160).nullable().optional(),
});
export type UpdateDeficiencyInput = z.infer<typeof updateDeficiencySchema>;
