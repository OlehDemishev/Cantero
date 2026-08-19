import { z } from "zod";

export const CLIENT_STAGES = ["lead", "contacted", "qualified", "won", "lost"] as const;
export type ClientStage = (typeof CLIENT_STAGES)[number];

export const updateClientSchema = z.object({
  stage: z.enum(CLIENT_STAGES).optional(),
  notes: z.string().max(2000).optional(),
});
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
