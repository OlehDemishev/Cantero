import { z } from "zod";

export const PERMIT_STATUSES = ["draft", "submitted", "approved", "rejected", "expired"] as const;
export type PermitStatus = (typeof PERMIT_STATUSES)[number];

export const INSPECTION_RESULTS = ["pending", "passed", "failed", "cancelled"] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

export const createPermitSchema = z.object({
  permitType: z.string().min(1).max(120),
  permitNumber: z.string().max(80).optional(),
  authorityName: z.string().max(160).optional(),
  submittedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreatePermitInput = z.infer<typeof createPermitSchema>;

export const updatePermitSchema = z.object({
  permitType: z.string().min(1).max(120).optional(),
  permitNumber: z.string().max(80).nullable().optional(),
  authorityName: z.string().max(160).nullable().optional(),
  status: z.enum(PERMIT_STATUSES).optional(),
  submittedAt: z.string().datetime().nullable().optional(),
  approvedAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdatePermitInput = z.infer<typeof updatePermitSchema>;

export const createInspectionSchema = z.object({
  inspectionType: z.string().min(1).max(120),
  scheduledDate: z.string().datetime().optional(),
  inspectorName: z.string().max(160).optional(),
  inspectorContact: z.string().max(160).optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateInspectionInput = z.infer<typeof createInspectionSchema>;

export const recordInspectionResultSchema = z.object({
  result: z.enum(INSPECTION_RESULTS),
  notes: z.string().max(2000).optional(),
});
export type RecordInspectionResultInput = z.infer<typeof recordInspectionResultSchema>;
