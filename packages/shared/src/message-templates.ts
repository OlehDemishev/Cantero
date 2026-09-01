import { z } from "zod";

export const MESSAGE_TEMPLATE_KEYS = [
  "task_assigned_sms",
  "safety_briefing_sms",
  "review_request_email",
  "nps_survey_email",
] as const;
export type MessageTemplateKey = (typeof MESSAGE_TEMPLATE_KEYS)[number];

/// Placeholders each template key may use — kept in shared so the settings editor UI and the
/// backend's validation agree on the same list without duplicating it.
export const MESSAGE_TEMPLATE_PLACEHOLDERS: Record<MessageTemplateKey, readonly string[]> = {
  task_assigned_sms: ["taskName", "projectName"],
  safety_briefing_sms: ["topic", "projectName", "date"],
  review_request_email: ["clientName", "companyName", "projectName", "reviewUrl"],
  nps_survey_email: ["clientName", "companyName", "projectName", "surveyUrl"],
};

export const upsertMessageTemplateSchema = z.object({
  body: z.string().min(1).max(1000),
});
export type UpsertMessageTemplateInput = z.infer<typeof upsertMessageTemplateSchema>;
