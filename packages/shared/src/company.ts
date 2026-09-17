import { z } from "zod";

export const UNIT_SYSTEMS = ["metric", "imperial"] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const SUPPORTED_CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD", "PLN", "UAH"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const SUPPORTED_LOCALES = ["en", "de", "es", "pl", "uk"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Fallback when no locale has been chosen yet, and the language the message catalogs in
 * packages/shared/messages are authored in. */
export const DEFAULT_LOCALE: Locale = "en";

/** Signup-form convenience only — a starting guess for which currency goes with a chosen locale,
 * not an enforced pairing. A company can still freely pick any supported currency regardless of
 * its locale (e.g. an English-language company invoicing in EUR), so nothing outside the signup
 * form should read this as a constraint. */
export const DEFAULT_CURRENCY_BY_LOCALE: Record<Locale, Currency> = {
  en: "USD",
  de: "EUR",
  es: "EUR",
  pl: "PLN",
  uk: "UAH",
};

export const companySettingsSchema = z.object({
  unitSystem: z.enum(UNIT_SYSTEMS),
  currency: z.enum(SUPPORTED_CURRENCIES),
  locale: z.enum(SUPPORTED_LOCALES),
  country: z.string().length(2), // ISO 3166-1 alpha-2
});
export type CompanySettings = z.infer<typeof companySettingsSchema>;

export const INVENTORY_COSTING_METHODS = ["fifo", "weighted_average"] as const;
export type InventoryCostingMethod = (typeof INVENTORY_COSTING_METHODS)[number];

export const DATEV_CHARTS_OF_ACCOUNTS = ["skr03", "skr04"] as const;
export type DatevChartOfAccounts = (typeof DATEV_CHARTS_OF_ACCOUNTS)[number];

export const PLAN_IDS = ["starter", "growth", "pro"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const MEMBERSHIP_ROLES_MANAGEABLE = ["admin", "estimator", "foreman", "accountant", "worker"] as const;

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
  submittalEscalationEnabled: z.boolean().optional(),
  invoiceRemindersEnabled: z.boolean().optional(),
  changeOrderApprovalThresholdAmount: z.number().nonnegative().nullable().optional(),
  changeOrderRequiredApprovalCount: z.number().int().min(1).max(10).optional(),
  leadFollowUpEnabled: z.boolean().optional(),
  estimateRemindersEnabled: z.boolean().optional(),
  changeOrderRemindersEnabled: z.boolean().optional(),
  enpsSurveysEnabled: z.boolean().optional(),
  budgetAlertThresholdPercent: z.number().int().min(1).max(100).optional(),
  lateFeePercentPerMonth: z.number().nonnegative().max(100).nullable().optional(),
  payrollTaxBurdenPercent: z.number().nonnegative().max(100).nullable().optional(),
  workersCompBurdenPercent: z.number().nonnegative().max(100).nullable().optional(),
  benefitsBurdenPercent: z.number().nonnegative().max(100).nullable().optional(),
  otherBurdenPercent: z.number().nonnegative().max(100).nullable().optional(),
  requireSubcontractorPrequalification: z.boolean().optional(),
  subcontractorEmrThreshold: z.number().nonnegative().max(99.99).nullable().optional(),
  defaultPaymentTermsDays: z.number().int().min(0).max(365).optional(),
  /// SMS to a worker's phone (in their preferredLocale) when assigned to a task, or when a
  /// safety briefing they're listed on is created — off by default, same "unsolicited message"
  /// reasoning as invoiceRemindersEnabled.
  workerSmsNotificationsEnabled: z.boolean().optional(),
  reviewRequestUrl: z.string().url().nullable().optional(),
  ipAllowlist: z.array(z.string().min(1).max(64)).max(50).optional(),
  sessionTimeoutMinutes: z.number().int().min(5).max(43_200).nullable().optional(),
  passwordMinLength: z.number().int().min(8).max(64).optional(),
  passwordRequireSymbol: z.boolean().optional(),
  hideCostDataFromRoles: z.array(z.enum(MEMBERSHIP_ROLES_MANAGEABLE)).optional(),
  /// Sidebar nav item keys this company has opted to hide — validated loosely (any short string,
  /// not a strict enum) since the canonical key list lives in the web app's nav config; a stale
  /// or unrecognized key here is a harmless no-op rather than a validation failure.
  hiddenNavItems: z.array(z.string().min(1).max(64)).optional(),
  slackWebhookUrl: z.string().url().nullable().optional(),
  teamsWebhookUrl: z.string().url().nullable().optional(),
  ptoAccrualHoursPerMonth: z.number().nonnegative().nullable().optional(),
  reportingCurrency: z.enum(SUPPORTED_CURRENCIES).nullable().optional(),
  /// Seller details for generated e-invoices (XRechnung/Factur-X) — see InvoicesService.generateXRechnungXml.
  address: z.string().max(200).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  vatId: z.string().max(30).nullable().optional(),
  iban: z.string().max(34).nullable().optional(),
  /// DATEV Buchungsstapel export settings — see InvoicesService.exportDatevSalesCsv /
  /// SubcontractorCostsService.exportDatevPurchasesCsv. Account numbers are plain digit strings,
  /// never guessed by the app — datevChartOfAccounts only drives which SKR03/SKR04 values the
  /// settings UI suggests.
  datevConsultantNumber: z.string().max(20).nullable().optional(),
  datevClientNumber: z.string().max(20).nullable().optional(),
  datevFiscalYearStartMonth: z.number().int().min(1).max(12).nullable().optional(),
  datevFiscalYearStartDay: z.number().int().min(1).max(31).nullable().optional(),
  datevChartOfAccounts: z.enum(DATEV_CHARTS_OF_ACCOUNTS).nullable().optional(),
  datevSachkontenlaenge: z.number().int().min(4).max(10).nullable().optional(),
  datevReceivablesAccount: z.string().regex(/^\d+$/, "Digits only").max(12).nullable().optional(),
  datevPayablesAccount: z.string().regex(/^\d+$/, "Digits only").max(12).nullable().optional(),
  datevRevenueAccountStandard: z.string().regex(/^\d+$/, "Digits only").max(12).nullable().optional(),
  datevRevenueAccountReduced: z.string().regex(/^\d+$/, "Digits only").max(12).nullable().optional(),
  datevRevenueAccountExempt: z.string().regex(/^\d+$/, "Digits only").max(12).nullable().optional(),
  datevExpenseAccountSubcontractors: z.string().regex(/^\d+$/, "Digits only").max(12).nullable().optional(),
  /// Peppol Participant ID (EndpointID) for outgoing BIS Billing 3.0 e-invoices — see
  /// InvoicesService.generatePeppolBisXml. peppolScheme is the EAS scheme code (e.g. "9930" for
  /// "DE:VAT"); no default is guessed, since Peppol covers every EU country's own scheme.
  peppolScheme: z.string().max(10).nullable().optional(),
  peppolParticipantId: z.string().max(50).nullable().optional(),
  inventoryCostingMethod: z.enum(INVENTORY_COSTING_METHODS).optional(),
  rateCatalogApprovalThresholdPercent: z.number().nonnegative().max(999.99).nullable().optional(),
  npsDetractorFollowUpEnabled: z.boolean().optional(),
});
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const linkToParentCompanySchema = z.object({
  code: z.string().min(6).max(40),
});
export type LinkToParentCompanyInput = z.infer<typeof linkToParentCompanySchema>;

export const setCustomPortalDomainSchema = z.object({
  domain: z
    .string()
    .max(253)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i, "Must be a plain domain name, e.g. portal.example.com")
    .nullable(),
});
export type SetCustomPortalDomainInput = z.infer<typeof setCustomPortalDomainSchema>;

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
  password: z.string().min(1).max(200),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

/** When the invited email already belongs to an existing account, accepting requires that
 * account's real password — see InvitesService.accept. If that account also has 2FA active,
 * the result is a challenge (same shape as LoginResult) rather than an access token. */
export type AcceptInviteResult = { accessToken: string; companyId: string } | { requires2fa: true; challengeToken: string };

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

export const COMPANY_DOCUMENT_TYPES = [
  "general_liability_insurance",
  "workers_comp_insurance",
  "umbrella_insurance",
  "builders_risk_insurance",
  "other",
] as const;
export type CompanyDocumentType = (typeof COMPANY_DOCUMENT_TYPES)[number];

export const addCompanyDocumentSchema = z.object({
  type: z.enum(COMPANY_DOCUMENT_TYPES),
  name: z.string().min(1).max(160),
  expiresAt: z.string().datetime(),
});
export type AddCompanyDocumentInput = z.infer<typeof addCompanyDocumentSchema>;

export const setCoiPubliclySharedSchema = z.object({
  coiPubliclyShared: z.boolean(),
});
export type SetCoiPubliclySharedInput = z.infer<typeof setCoiPubliclySharedSchema>;

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(80),
  /// Empty/omitted = unrestricted (full read access to every /v1 dataset).
  scopes: z.array(z.enum(API_KEY_SCOPES)).max(API_KEY_SCOPES.length).optional(),
  expiresAt: z.string().datetime().optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const createCompanyHolidaySchema = z.object({
  date: z.string().datetime(),
  label: z.string().min(1).max(120),
});
export type CreateCompanyHolidayInput = z.infer<typeof createCompanyHolidaySchema>;
