import { z } from "zod";

export const CLIENT_STAGES = ["lead", "contacted", "qualified", "won", "lost"] as const;
export type ClientStage = (typeof CLIENT_STAGES)[number];

export const updateClientSchema = z.object({
  stage: z.enum(CLIENT_STAGES).optional(),
  notes: z.string().max(2000).optional(),
});
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export const CLIENT_ACTIVITY_TYPES = ["note", "call", "meeting", "email"] as const;
export type ClientActivityType = (typeof CLIENT_ACTIVITY_TYPES)[number];

export const addClientActivitySchema = z.object({
  type: z.enum(CLIENT_ACTIVITY_TYPES),
  content: z.string().min(1).max(2000),
});
export type AddClientActivityInput = z.infer<typeof addClientActivitySchema>;

export const addClientReminderSchema = z.object({
  title: z.string().min(1).max(200),
  dueDate: z.string().datetime(),
});
export type AddClientReminderInput = z.infer<typeof addClientReminderSchema>;
