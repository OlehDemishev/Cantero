import { z } from "zod";

export const UNIT_SYSTEMS = ["metric", "imperial"] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const SUPPORTED_CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const SUPPORTED_LOCALES = ["en", "de", "es", "pl", "uk"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const companySettingsSchema = z.object({
  unitSystem: z.enum(UNIT_SYSTEMS),
  currency: z.enum(SUPPORTED_CURRENCIES),
  locale: z.enum(SUPPORTED_LOCALES),
  country: z.string().length(2), // ISO 3166-1 alpha-2
});
export type CompanySettings = z.infer<typeof companySettingsSchema>;

export const PLAN_IDS = ["starter", "growth", "pro"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const updateCompanySchema = z.object({
  name: z.string().min(2).max(120).optional(),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
});
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const MEMBERSHIP_ROLES_MANAGEABLE = ["admin", "estimator", "foreman", "accountant", "worker"] as const;

export const updateMemberRoleSchema = z.object({
  role: z.enum(MEMBERSHIP_ROLES_MANAGEABLE),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(MEMBERSHIP_ROLES_MANAGEABLE),
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(10),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const changePlanSchema = z.object({
  planCode: z.enum(PLAN_IDS),
});
export type ChangePlanInput = z.infer<typeof changePlanSchema>;

export const updateSeatsSchema = z.object({
  seats: z.number().int().min(1).max(500),
});
export type UpdateSeatsInput = z.infer<typeof updateSeatsSchema>;

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(80),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
