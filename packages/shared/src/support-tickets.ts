import { z } from "zod";

export const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUSES = ["open", "in_progress", "waiting_on_customer", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const createSupportTicketSchema = z.object({
  projectId: z.string().uuid().optional(),
  requesterClientId: z.string().uuid().optional(),
  requesterName: z.string().min(1).max(160),
  requesterEmail: z.string().email().optional(),
  subject: z.string().min(1).max(200),
  category: z.string().max(80).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
});
export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;

export const updateTicketStatusSchema = z.object({
  status: z.enum(TICKET_STATUSES),
});
export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;

export const assignTicketSchema = z.object({
  userId: z.string().uuid().nullable(),
});
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;

export const addTicketMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  isInternal: z.boolean().optional(),
});
export type AddTicketMessageInput = z.infer<typeof addTicketMessageSchema>;

export const upsertSlaPolicySchema = z.object({
  priority: z.enum(TICKET_PRIORITIES),
  responseMinutes: z.number().int().positive(),
  resolutionMinutes: z.number().int().positive(),
});
export type UpsertSlaPolicyInput = z.infer<typeof upsertSlaPolicySchema>;

export const portalCreateTicketSchema = z.object({
  projectId: z.string().uuid().optional(),
  subject: z.string().min(1).max(200),
  category: z.string().max(80).optional(),
  content: z.string().min(1).max(4000),
});
export type PortalCreateTicketInput = z.infer<typeof portalCreateTicketSchema>;

export const portalAddTicketMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});
export type PortalAddTicketMessageInput = z.infer<typeof portalAddTicketMessageSchema>;
