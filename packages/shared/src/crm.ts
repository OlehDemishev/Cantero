import { z } from "zod";

export const CLIENT_STAGES = ["lead", "contacted", "qualified", "won", "lost"] as const;
export type ClientStage = (typeof CLIENT_STAGES)[number];

export const updateClientSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).optional(),
  estimatedValue: z.number().nonnegative().max(100_000_000).nullable().optional(),
  ownerWorkerId: z.string().uuid().nullable().optional(),
});
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export const moveClientStageSchema = z
  .object({
    stage: z.enum(CLIENT_STAGES),
    lostReason: z.string().min(1).max(500).optional(),
  })
  .refine((v) => v.stage !== "lost" || !!v.lostReason, {
    message: "lostReason is required when moving a client to lost",
    path: ["lostReason"],
  });
export type MoveClientStageInput = z.infer<typeof moveClientStageSchema>;

export const convertClientToProjectSchema = z.object({
  name: z.string().min(1).max(160),
  address: z.string().max(300).optional(),
});
export type ConvertClientToProjectInput = z.infer<typeof convertClientToProjectSchema>;

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
