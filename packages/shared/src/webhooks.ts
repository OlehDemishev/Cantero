import { z } from "zod";

export const WEBHOOK_EVENTS = [
  "estimate.sent",
  "estimate.client_approved",
  "estimate.client_rejected",
  "change_order.sent",
  "change_order.client_approved",
  "change_order.client_rejected",
  "invoice.sent",
  "invoice.payment_recorded",
  "invoice.recurring_generated",
  "material.low_stock",
  "rfi.answered",
  "rfi.closed",
  "punch_list.resolved",
  "punch_list.verified",
  "submittal.approved",
  "submittal.revise_requested",
  "submittal.rejected",
  "safety_incident.logged",
  "warranty_claim.submitted",
  "warranty_claim.resolved",
  "warranty_claim.denied",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const createWebhookEndpointSchema = z.object({
  url: z.string().url().max(500),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});
export type CreateWebhookEndpointInput = z.infer<typeof createWebhookEndpointSchema>;

export const updateWebhookEndpointSchema = z.object({
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
  active: z.boolean().optional(),
});
export type UpdateWebhookEndpointInput = z.infer<typeof updateWebhookEndpointSchema>;
