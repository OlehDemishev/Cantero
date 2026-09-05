import { z } from "zod";

export const TM_TICKET_STATUSES = ["draft", "submitted", "approved", "rejected", "disputed"] as const;
export type TMTicketStatus = (typeof TM_TICKET_STATUSES)[number];

export const createTMTicketSchema = z.object({
  workDate: z.string().datetime(),
  description: z.string().min(1).max(2000),
  laborCost: z.number().nonnegative().default(0),
  equipmentCost: z.number().nonnegative().default(0),
  materialCost: z.number().nonnegative().default(0),
});
export type CreateTMTicketInput = z.infer<typeof createTMTicketSchema>;

export const decideTMTicketSchema = z
  .object({
    status: z.enum(["approved", "rejected", "disputed"]),
    ownerSignerName: z.string().min(1).max(160),
    /// Required when status="disputed" — why the owner is sending it back for revision.
    disputeReason: z.string().min(1).max(1000).optional(),
  })
  .refine((data) => data.status !== "disputed" || !!data.disputeReason, {
    message: "A dispute reason is required when disputing a T&M ticket",
    path: ["disputeReason"],
  });
export type DecideTMTicketInput = z.infer<typeof decideTMTicketSchema>;

/// Edits a disputed ticket's cost/description fields and returns it to draft for another
/// decideTMTicket() pass — only the fields actually being corrected need to be sent.
export const reviseTMTicketSchema = z.object({
  description: z.string().min(1).max(2000).optional(),
  laborCost: z.number().nonnegative().optional(),
  equipmentCost: z.number().nonnegative().optional(),
  materialCost: z.number().nonnegative().optional(),
});
export type ReviseTMTicketInput = z.infer<typeof reviseTMTicketSchema>;
