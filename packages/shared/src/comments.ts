import { z } from "zod";

export const createCommentSchema = z
  .object({
    taskId: z.string().uuid().optional(),
    rfiId: z.string().uuid().optional(),
    punchListItemId: z.string().uuid().optional(),
    content: z.string().min(1).max(2000),
    mentionedUserIds: z.array(z.string().uuid()).max(20).optional(),
  })
  .refine((v) => [v.taskId, v.rfiId, v.punchListItemId].filter((x) => x !== undefined).length === 1, {
    message: "Exactly one of taskId, rfiId, punchListItemId is required",
  });
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
