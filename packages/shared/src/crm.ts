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
  referredByClientId: z.string().uuid().nullable().optional(),
  probability: z.number().int().min(0).max(100).nullable().optional(),
  expectedCloseDate: z.string().datetime().nullable().optional(),
});
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

/** Default win-likelihood per stage, used for pipeline forecasting whenever a client has no
 * manually-set probability — so every open deal contributes a sensible weighted value. */
export const CLIENT_STAGE_DEFAULT_PROBABILITY: Record<ClientStage, number> = {
  lead: 10,
  contacted: 25,
  qualified: 60,
  won: 100,
  lost: 0,
};

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
