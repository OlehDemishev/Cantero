export const ACCOUNTING_PROVIDERS = ["quickbooks", "xero"] as const;
export type AccountingProviderType = (typeof ACCOUNTING_PROVIDERS)[number];
