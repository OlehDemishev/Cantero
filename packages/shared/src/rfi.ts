import { z } from "zod";

export const RFI_STATUSES = ["open", "answered", "closed"] as const;
export type RfiStatus = (typeof RFI_STATUSES)[number];

export const RFI_PRIORITIES = ["low", "medium", "high"] as const;
export type RfiPriority = (typeof RFI_PRIORITIES)[number];

export const BALL_IN_COURT_PARTIES = ["internal", "client", "subcontractor"] as const;
export type BallInCourtParty = (typeof BALL_IN_COURT_PARTIES)[number];

export const createRfiSchema = z.object({
  projectId: z.string().uuid(),
  subject: z.string().min(1).max(200),
  question: z.string().min(1).max(4000),
  priority: z.enum(RFI_PRIORITIES).optional(),
  dueDate: z.string().datetime().optional(),
  costImpact: z.boolean().optional(),
  scheduleImpactDays: z.number().int().min(0).max(3650).optional(),
});
export type CreateRfiInput = z.infer<typeof createRfiSchema>;

export const updateRfiSchema = z.object({
  subject: z.string().min(1).max(200).optional(),
  question: z.string().min(1).max(4000).optional(),
  priority: z.enum(RFI_PRIORITIES).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  costImpact: z.boolean().optional(),
  scheduleImpactDays: z.number().int().min(0).max(3650).nullable().optional(),
});
export type UpdateRfiInput = z.infer<typeof updateRfiSchema>;

export const setRfiBallInCourtSchema = z.object({
  ballInCourtParty: z.enum(BALL_IN_COURT_PARTIES),
});
export type SetRfiBallInCourtInput = z.infer<typeof setRfiBallInCourtSchema>;

export const answerRfiSchema = z.object({
  answer: z.string().min(1).max(4000),
});
export type AnswerRfiInput = z.infer<typeof answerRfiSchema>;
