import { z } from "zod";

export const LIEN_NOTICE_DIRECTIONS = ["sent", "received"] as const;
export type LienNoticeDirection = (typeof LIEN_NOTICE_DIRECTIONS)[number];

export const LIEN_NOTICE_TYPES = ["preliminary_notice", "notice_to_owner", "notice_of_furnishing", "other"] as const;
export type LienNoticeType = (typeof LIEN_NOTICE_TYPES)[number];

export const LIEN_FILING_STATUSES = ["filed", "released", "disputed"] as const;
export type LienFilingStatus = (typeof LIEN_FILING_STATUSES)[number];

export const createLienNoticeSchema = z.object({
  direction: z.enum(LIEN_NOTICE_DIRECTIONS),
  type: z.enum(LIEN_NOTICE_TYPES).optional(),
  relatedPartyName: z.string().min(1).max(200),
  firstFurnishDate: z.string().datetime().optional(),
  deadlineDate: z.string().datetime().optional(),
  methodOfService: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateLienNoticeInput = z.infer<typeof createLienNoticeSchema>;

export const createMechanicsLienFilingSchema = z.object({
  filedByName: z.string().min(1).max(200),
  amount: z.number().positive(),
  filedAt: z.string().datetime(),
  notes: z.string().max(2000).optional(),
});
export type CreateMechanicsLienFilingInput = z.infer<typeof createMechanicsLienFilingSchema>;

export const updateLienFilingStatusSchema = z.object({
  status: z.enum(LIEN_FILING_STATUSES),
});
export type UpdateLienFilingStatusInput = z.infer<typeof updateLienFilingStatusSchema>;
