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
  "client.won",
  "client.lost",
  "client.lead_captured",
  "expense.approved",
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

/**
 * Curated event bundles for common integration targets — a starting point the create-webhook
 * form can pre-check, not a persisted/enforced grouping. The user can still add or remove
 * individual events after picking a template; nothing here restricts what a webhook can send.
 */
export interface WebhookTemplate {
  id: string;
  label: string;
  description: string;
  events: WebhookEvent[];
}

export const WEBHOOK_TEMPLATES: WebhookTemplate[] = [
  {
    id: "chat-notifications",
    label: "Chat notifications (Slack / Teams)",
    description: "The handful of events worth an immediate ping to the team channel.",
    events: ["safety_incident.logged", "warranty_claim.submitted", "invoice.payment_recorded", "client.lead_captured", "submittal.rejected"],
  },
  {
    id: "sales-crm",
    label: "Sales & CRM",
    description: "Client pipeline and estimate decisions — the events a CRM/Zapier sales flow cares about.",
    events: ["client.lead_captured", "client.won", "client.lost", "estimate.sent", "estimate.client_approved", "estimate.client_rejected"],
  },
  {
    id: "field-operations",
    label: "Field operations",
    description: "RFIs, punch lists, and submittals moving through their review cycle on site.",
    events: ["rfi.answered", "rfi.closed", "punch_list.resolved", "punch_list.verified", "submittal.approved", "submittal.revise_requested", "submittal.rejected"],
  },
  {
    id: "finance-billing",
    label: "Finance & billing",
    description: "Money-moving events for accounting automations and bookkeeping tools.",
    events: ["invoice.sent", "invoice.payment_recorded", "invoice.recurring_generated", "expense.approved", "change_order.client_approved", "change_order.client_rejected"],
  },
  {
    id: "warranty-support",
    label: "Warranty & support",
    description: "Post-handover claims and low-stock alerts.",
    events: ["warranty_claim.submitted", "warranty_claim.resolved", "warranty_claim.denied", "material.low_stock"],
  },
];
