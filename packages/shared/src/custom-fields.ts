import { z } from "zod";

export const CUSTOM_FIELD_ENTITY_TYPES = ["project", "client"] as const;
export type CustomFieldEntityType = (typeof CUSTOM_FIELD_ENTITY_TYPES)[number];

export const CUSTOM_FIELD_TYPES = ["text", "number", "date", "boolean", "select"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const createCustomFieldDefinitionSchema = z.object({
  entityType: z.enum(CUSTOM_FIELD_ENTITY_TYPES),
  name: z.string().min(1).max(80),
  type: z.enum(CUSTOM_FIELD_TYPES),
  options: z.array(z.string().min(1).max(80)).max(50).optional(),
});
export type CreateCustomFieldDefinitionInput = z.infer<typeof createCustomFieldDefinitionSchema>;

export const setCustomFieldValuesSchema = z.object({
  values: z.array(z.object({ fieldId: z.string().uuid(), value: z.string().max(2000).nullable() })),
});
export type SetCustomFieldValuesInput = z.infer<typeof setCustomFieldValuesSchema>;
