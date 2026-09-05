import { z } from "zod";

export const BMP_INSPECTION_RESULTS = ["satisfactory", "deficient"] as const;
export type BmpInspectionResult = (typeof BMP_INSPECTION_RESULTS)[number];

export const ENVIRONMENTAL_INCIDENT_SEVERITIES = ["minor", "moderate", "major"] as const;
export type EnvironmentalIncidentSeverity = (typeof ENVIRONMENTAL_INCIDENT_SEVERITIES)[number];

export const ENVIRONMENTAL_INCIDENT_STATUSES = ["open", "contained", "resolved"] as const;
export type EnvironmentalIncidentStatus = (typeof ENVIRONMENTAL_INCIDENT_STATUSES)[number];

export const createStormwaterPermitSchema = z.object({
  permitNumber: z.string().max(120).optional(),
  noiFiledAt: z.string().datetime().optional(),
});
export type CreateStormwaterPermitInput = z.infer<typeof createStormwaterPermitSchema>;

export const fileNoticeOfTerminationSchema = z.object({
  notFiledAt: z.string().datetime(),
});
export type FileNoticeOfTerminationInput = z.infer<typeof fileNoticeOfTerminationSchema>;

export const addBmpInspectionSchema = z.object({
  triggerReason: z.string().max(160).optional(),
  result: z.enum(BMP_INSPECTION_RESULTS),
  inspectorName: z.string().max(160).optional(),
  correctiveActions: z.string().max(2000).optional(),
});
export type AddBmpInspectionInput = z.infer<typeof addBmpInspectionSchema>;

export const reportEnvironmentalIncidentSchema = z.object({
  description: z.string().min(1).max(4000),
  severity: z.enum(ENVIRONMENTAL_INCIDENT_SEVERITIES).optional(),
  regulatorNotified: z.boolean().optional(),
});
export type ReportEnvironmentalIncidentInput = z.infer<typeof reportEnvironmentalIncidentSchema>;

export const updateEnvironmentalIncidentStatusSchema = z.object({
  status: z.enum(ENVIRONMENTAL_INCIDENT_STATUSES),
});
export type UpdateEnvironmentalIncidentStatusInput = z.infer<typeof updateEnvironmentalIncidentStatusSchema>;
