import { z } from "zod";

export const TRANSMITTAL_METHODS = ["email", "mail", "hand_delivery", "courier", "portal"] as const;
export type TransmittalMethod = (typeof TRANSMITTAL_METHODS)[number];

export const transmittalItemInputSchema = z.object({
  description: z.string().min(1).max(300),
  quantity: z.number().int().positive().default(1),
});
export type TransmittalItemInput = z.infer<typeof transmittalItemInputSchema>;

export const createTransmittalSchema = z.object({
  recipientName: z.string().min(1).max(160),
  recipientCompany: z.string().max(160).optional(),
  method: z.enum(TRANSMITTAL_METHODS).default("email"),
  purpose: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  items: z.array(transmittalItemInputSchema).min(1),
});
export type CreateTransmittalInput = z.infer<typeof createTransmittalSchema>;

export const acknowledgeTransmittalSchema = z.object({
  acknowledgedByName: z.string().min(1).max(160),
});
export type AcknowledgeTransmittalInput = z.infer<typeof acknowledgeTransmittalSchema>;
