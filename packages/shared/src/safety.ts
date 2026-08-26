import { z } from "zod";

export const INCIDENT_SEVERITIES = ["near_miss", "first_aid", "medical_treatment", "lost_time_injury", "fatality"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const OSHA_CASE_TYPES = [
  "injury",
  "skin_disorder",
  "respiratory_condition",
  "poisoning",
  "hearing_loss",
  "all_other_illnesses",
] as const;
export type OshaCaseType = (typeof OSHA_CASE_TYPES)[number];

export const createIncidentReportSchema = z.object({
  projectId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  severity: z.enum(INCIDENT_SEVERITIES),
  description: z.string().min(1).max(4000),
  location: z.string().max(160).optional(),
  involvedPersons: z.string().max(1000).optional(),
  correctiveActions: z.string().max(2000).optional(),
  oshaRecordable: z.boolean().default(false),
  oshaCaseType: z.enum(OSHA_CASE_TYPES).optional(),
  daysAwayFromWork: z.number().int().min(0).optional(),
  daysJobTransferOrRestriction: z.number().int().min(0).optional(),
});
export type CreateIncidentReportInput = z.infer<typeof createIncidentReportSchema>;

export const updateIncidentReportSchema = createIncidentReportSchema.omit({ projectId: true }).partial();
export type UpdateIncidentReportInput = z.infer<typeof updateIncidentReportSchema>;

export const createSafetyBriefingSchema = z.object({
  projectId: z.string().uuid(),
  date: z.string().datetime(),
  topic: z.string().min(1).max(200),
  notes: z.string().max(2000).optional(),
  attendeeWorkerIds: z.array(z.string().uuid()).default([]),
});
export type CreateSafetyBriefingInput = z.infer<typeof createSafetyBriefingSchema>;

export const updateSafetyBriefingSchema = z.object({
  topic: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).optional(),
  attendeeWorkerIds: z.array(z.string().uuid()).optional(),
});
export type UpdateSafetyBriefingInput = z.infer<typeof updateSafetyBriefingSchema>;
