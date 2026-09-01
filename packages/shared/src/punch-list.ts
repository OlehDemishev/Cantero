import { z } from "zod";

export const PUNCH_LIST_ITEM_STATUSES = ["open", "resolved", "verified"] as const;
export type PunchListItemStatus = (typeof PUNCH_LIST_ITEM_STATUSES)[number];

export const createPunchListItemSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  location: z.string().max(160).optional(),
  assigneeWorkerId: z.string().uuid().optional(),
  assigneeSubcontractorId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
});
export type CreatePunchListItemInput = z.infer<typeof createPunchListItemSchema>;

export const updatePunchListItemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  location: z.string().max(160).optional(),
  assigneeWorkerId: z.string().uuid().nullable().optional(),
  assigneeSubcontractorId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});
export type UpdatePunchListItemInput = z.infer<typeof updatePunchListItemSchema>;
