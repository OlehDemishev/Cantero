import { z } from "zod";

export const CHECKLIST_TEMPLATE_TYPES = ["punch_list", "rfi", "safety_briefing"] as const;
export type ChecklistTemplateType = (typeof CHECKLIST_TEMPLATE_TYPES)[number];

export const checklistTemplateItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  location: z.string().max(160).optional(),
});
export type ChecklistTemplateItemInput = z.infer<typeof checklistTemplateItemSchema>;

export const createChecklistTemplateSchema = z
  .object({
    type: z.enum(CHECKLIST_TEMPLATE_TYPES),
    name: z.string().min(1).max(160),
    items: z.array(checklistTemplateItemSchema).max(50).optional(),
    defaultSubject: z.string().min(1).max(200).optional(),
    defaultBody: z.string().max(4000).optional(),
  })
  .refine((v) => v.type !== "punch_list" || (v.items?.length ?? 0) > 0, {
    message: "At least one checklist item is required for a punch list template",
    path: ["items"],
  })
  .refine((v) => v.type === "punch_list" || !!v.defaultSubject, {
    message: "defaultSubject is required for this template type",
    path: ["defaultSubject"],
  });
export type CreateChecklistTemplateInput = z.infer<typeof createChecklistTemplateSchema>;

export const updateChecklistTemplateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  items: z.array(checklistTemplateItemSchema).max(50).optional(),
  defaultSubject: z.string().min(1).max(200).optional(),
  defaultBody: z.string().max(4000).optional(),
});
export type UpdateChecklistTemplateInput = z.infer<typeof updateChecklistTemplateSchema>;

export const applyChecklistTemplateSchema = z.object({
  projectId: z.string().uuid(),
});
export type ApplyChecklistTemplateInput = z.infer<typeof applyChecklistTemplateSchema>;
