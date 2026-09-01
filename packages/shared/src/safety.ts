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

export const createJhaSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  date: z.string().datetime(),
  taskDescription: z.string().min(1).max(300),
  hazards: z.string().min(1).max(2000),
  controlMeasures: z.string().min(1).max(2000),
  requiredPpe: z.string().max(500).optional(),
  acknowledgedWorkerIds: z.array(z.string().uuid()).default([]),
});
export type CreateJhaInput = z.infer<typeof createJhaSchema>;

export const acknowledgeJhaSchema = z.object({
  workerIds: z.array(z.string().uuid()).min(1),
});
export type AcknowledgeJhaInput = z.infer<typeof acknowledgeJhaSchema>;

export const INSURANCE_CLAIM_TYPES = ["general_liability", "workers_comp", "property", "auto", "equipment", "other"] as const;
export type InsuranceClaimType = (typeof INSURANCE_CLAIM_TYPES)[number];

export const INSURANCE_CLAIM_STATUSES = ["filed", "under_review", "approved", "denied", "settled", "closed"] as const;
export type InsuranceClaimStatus = (typeof INSURANCE_CLAIM_STATUSES)[number];

export const createInsuranceClaimSchema = z.object({
  projectId: z.string().uuid().optional(),
  incidentReportId: z.string().uuid().optional(),
  claimType: z.enum(INSURANCE_CLAIM_TYPES),
  claimNumber: z.string().max(80).optional(),
  insurerName: z.string().min(1).max(160),
  policyNumber: z.string().max(80).optional(),
  dateFiled: z.string().datetime(),
  description: z.string().min(1).max(4000),
  adjusterName: z.string().max(160).optional(),
  adjusterContact: z.string().max(200).optional(),
  claimAmount: z.number().nonnegative().optional(),
});
export type CreateInsuranceClaimInput = z.infer<typeof createInsuranceClaimSchema>;

export const updateInsuranceClaimSchema = z.object({
  status: z.enum(INSURANCE_CLAIM_STATUSES).optional(),
  claimNumber: z.string().max(80).nullable().optional(),
  insurerName: z.string().min(1).max(160).optional(),
  policyNumber: z.string().max(80).nullable().optional(),
  description: z.string().min(1).max(4000).optional(),
  adjusterName: z.string().max(160).nullable().optional(),
  adjusterContact: z.string().max(200).nullable().optional(),
  claimAmount: z.number().nonnegative().nullable().optional(),
  settledAmount: z.number().nonnegative().nullable().optional(),
  settledAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdateInsuranceClaimInput = z.infer<typeof updateInsuranceClaimSchema>;
