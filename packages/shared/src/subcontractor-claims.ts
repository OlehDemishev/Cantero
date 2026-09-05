import { z } from "zod";

export const BACKCHARGE_STATUSES = ["pending", "deducted", "waived"] as const;
export type SubcontractorBackchargeStatus = (typeof BACKCHARGE_STATUSES)[number];

export const createBackchargeSchema = z.object({
  subcontractorId: z.string().uuid(),
  punchListItemId: z.string().uuid().optional(),
  warrantyClaimId: z.string().uuid().optional(),
  description: z.string().min(1).max(500),
  amount: z.number().positive(),
});
export type CreateBackchargeInput = z.infer<typeof createBackchargeSchema>;

export const DEFAULT_NOTICE_STATUSES = ["issued", "cured", "terminated"] as const;
export type SubcontractorDefaultNoticeStatus = (typeof DEFAULT_NOTICE_STATUSES)[number];

export const createDefaultNoticeSchema = z.object({
  subcontractorId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  curePeriodDays: z.number().int().positive().optional(),
});
export type CreateDefaultNoticeInput = z.infer<typeof createDefaultNoticeSchema>;
