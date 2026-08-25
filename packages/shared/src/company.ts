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
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #465fff")
    .nullable()
    .optional(),
  approvalThresholdAmount: z.number().nonnegative().nullable().optional(),
  requiredApprovalCount: z.number().int().min(1).max(10).optional(),
  rfiSlaDays: z.number().int().min(1).max(365).nullable().optional(),
  punchListSlaDays: z.number().int().min(1).max(365).nullable().optional(),
  invoiceRemindersEnabled: z.boolean().optional(),
  reviewRequestUrl: z.string().url().nullable().optional(),
  ipAllowlist: z.array(z.string().min(1).max(64)).max(50).optional(),
  slackWebhookUrl: z.string().url().nullable().optional(),
  teamsWebhookUrl: z.string().url().nullable().optional(),
  ptoAccrualHoursPerMonth: z.number().nonnegative().nullable().optional(),
  reportingCurrency: z.enum(SUPPORTED_CURRENCIES).nullable().optional(),
});
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const linkToParentCompanySchema = z.object({
  code: z.string().min(6).max(40),
});
export type LinkToParentCompanyInput = z.infer<typeof linkToParentCompanySchema>;

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

/** The public API's readable resources — matches the datasets exposed under /api/v1/*. */
export const API_KEY_SCOPES = [
  "projects",
  "clients",
  "invoices",
  "estimates",
  "workers",
  "materials",
  "time-entries",
  "budget",
] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(80),
  /// Empty/omitted = unrestricted (full read access to every /v1 dataset).
  scopes: z.array(z.enum(API_KEY_SCOPES)).max(API_KEY_SCOPES.length).optional(),
  expiresAt: z.string().datetime().optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
