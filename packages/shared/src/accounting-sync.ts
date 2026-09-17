export const ACCOUNTING_PROVIDERS = ["quickbooks", "xero", "lexoffice"] as const;
export type AccountingProviderType = (typeof ACCOUNTING_PROVIDERS)[number];
