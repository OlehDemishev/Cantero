import type { Dispatch, SetStateAction } from "react";

/** The company record as GET /company returns it. */
export interface Company {
  name: string;
  locale: string;
  brandColor: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  vatId: string | null;
  // Only sent to members with settings.company (absent for everyone else, who sees the form read-only).
  iban?: string | null;
  datevConsultantNumber?: string | null;
  datevClientNumber?: string | null;
  datevFiscalYearStartMonth: number | null;
  datevFiscalYearStartDay: number | null;
  datevChartOfAccounts: "skr03" | "skr04" | null;
  datevSachkontenlaenge: number | null;
  datevReceivablesAccount: string | null;
  datevPayablesAccount: string | null;
  datevRevenueAccountStandard: string | null;
  datevRevenueAccountReduced: string | null;
  datevRevenueAccountExempt: string | null;
  datevExpenseAccountSubcontractors: string | null;
  peppolScheme: string | null;
  peppolParticipantId: string | null;
  approvalThresholdAmount: string | null;
  requiredApprovalCount: number;
  changeOrderApprovalThresholdAmount: string | null;
  changeOrderRequiredApprovalCount: number;
  budgetAlertThresholdPercent: number;
  lateFeePercentPerMonth: string | null;
  payrollTaxBurdenPercent: string | null;
  workersCompBurdenPercent: string | null;
  benefitsBurdenPercent: string | null;
  otherBurdenPercent: string | null;
  requireSubcontractorPrequalification: boolean;
  subcontractorEmrThreshold: string | null;
  defaultPaymentTermsDays: number;
  rfiSlaDays: number | null;
  punchListSlaDays: number | null;
  submittalEscalationEnabled: boolean;
  inventoryCostingMethod: "fifo" | "weighted_average";
  rateCatalogApprovalThresholdPercent: string | null;
  npsDetractorFollowUpEnabled: boolean;
  invoiceRemindersEnabled: boolean;
  leadFollowUpEnabled: boolean;
  estimateRemindersEnabled: boolean;
  changeOrderRemindersEnabled: boolean;
  enpsSurveysEnabled: boolean;
  workerSmsNotificationsEnabled: boolean;
  reviewRequestUrl: string | null;
  reportingCurrency: string | null;
}

/** The company settings form: every input as the string (or flag) it edits. */
export interface CompanyForm {
  name: string;
  locale: string;
  brandColor: string | null;
  address: string;
  city: string;
  postalCode: string;
  vatId: string;
  iban: string;
  datevConsultantNumber: string;
  datevClientNumber: string;
  datevFiscalYearStartMonth: string;
  datevFiscalYearStartDay: string;
  datevChartOfAccounts: "" | "skr03" | "skr04";
  datevSachkontenlaenge: string;
  datevReceivablesAccount: string;
  datevPayablesAccount: string;
  datevRevenueAccountStandard: string;
  datevRevenueAccountReduced: string;
  datevRevenueAccountExempt: string;
  datevExpenseAccountSubcontractors: string;
  peppolScheme: string;
  peppolParticipantId: string;
  approvalThresholdAmount: string;
  requiredApprovalCount: string;
  changeOrderApprovalThresholdAmount: string;
  changeOrderRequiredApprovalCount: string;
  budgetAlertThresholdPercent: string;
  lateFeePercentPerMonth: string;
  payrollTaxBurdenPercent: string;
  workersCompBurdenPercent: string;
  benefitsBurdenPercent: string;
  otherBurdenPercent: string;
  requireSubcontractorPrequalification: boolean;
  subcontractorEmrThreshold: string;
  defaultPaymentTermsDays: string;
  rfiSlaDays: string;
  punchListSlaDays: string;
  submittalEscalationEnabled: boolean;
  inventoryCostingMethod: "fifo" | "weighted_average";
  rateCatalogApprovalThresholdPercent: string;
  npsDetractorFollowUpEnabled: boolean;
  invoiceRemindersEnabled: boolean;
  leadFollowUpEnabled: boolean;
  estimateRemindersEnabled: boolean;
  changeOrderRemindersEnabled: boolean;
  enpsSurveysEnabled: boolean;
  workerSmsNotificationsEnabled: boolean;
  reviewRequestUrl: string;
  reportingCurrency: string;
}

export const EMPTY_COMPANY_FORM: CompanyForm = {
  name: "",
  locale: "en",
  brandColor: null,
  address: "",
  city: "",
  postalCode: "",
  vatId: "",
  iban: "",
  datevConsultantNumber: "",
  datevClientNumber: "",
  datevFiscalYearStartMonth: "",
  datevFiscalYearStartDay: "",
  datevChartOfAccounts: "",
  datevSachkontenlaenge: "",
  datevReceivablesAccount: "",
  datevPayablesAccount: "",
  datevRevenueAccountStandard: "",
  datevRevenueAccountReduced: "",
  datevRevenueAccountExempt: "",
  datevExpenseAccountSubcontractors: "",
  peppolScheme: "",
  peppolParticipantId: "",
  approvalThresholdAmount: "",
  requiredApprovalCount: "1",
  changeOrderApprovalThresholdAmount: "",
  changeOrderRequiredApprovalCount: "1",
  budgetAlertThresholdPercent: "90",
  lateFeePercentPerMonth: "",
  payrollTaxBurdenPercent: "",
  workersCompBurdenPercent: "",
  benefitsBurdenPercent: "",
  otherBurdenPercent: "",
  requireSubcontractorPrequalification: false,
  subcontractorEmrThreshold: "",
  defaultPaymentTermsDays: "30",
  rfiSlaDays: "",
  punchListSlaDays: "",
  submittalEscalationEnabled: false,
  inventoryCostingMethod: "weighted_average",
  rateCatalogApprovalThresholdPercent: "",
  npsDetractorFollowUpEnabled: false,
  invoiceRemindersEnabled: false,
  leadFollowUpEnabled: false,
  estimateRemindersEnabled: false,
  changeOrderRemindersEnabled: false,
  enpsSurveysEnabled: false,
  workerSmsNotificationsEnabled: false,
  reviewRequestUrl: "",
  reportingCurrency: "",
};

export function companyToForm(c: Company): CompanyForm {
  return {
    name: c.name,
    locale: c.locale,
    brandColor: c.brandColor,
    address: c.address ?? "",
    city: c.city ?? "",
    postalCode: c.postalCode ?? "",
    vatId: c.vatId ?? "",
    iban: c.iban ?? "",
    datevConsultantNumber: c.datevConsultantNumber ?? "",
    datevClientNumber: c.datevClientNumber ?? "",
    datevFiscalYearStartMonth: c.datevFiscalYearStartMonth !== null ? String(c.datevFiscalYearStartMonth) : "",
    datevFiscalYearStartDay: c.datevFiscalYearStartDay !== null ? String(c.datevFiscalYearStartDay) : "",
    datevChartOfAccounts: c.datevChartOfAccounts ?? "",
    datevSachkontenlaenge: c.datevSachkontenlaenge !== null ? String(c.datevSachkontenlaenge) : "",
    datevReceivablesAccount: c.datevReceivablesAccount ?? "",
    datevPayablesAccount: c.datevPayablesAccount ?? "",
    datevRevenueAccountStandard: c.datevRevenueAccountStandard ?? "",
    datevRevenueAccountReduced: c.datevRevenueAccountReduced ?? "",
    datevRevenueAccountExempt: c.datevRevenueAccountExempt ?? "",
    datevExpenseAccountSubcontractors: c.datevExpenseAccountSubcontractors ?? "",
    peppolScheme: c.peppolScheme ?? "",
    peppolParticipantId: c.peppolParticipantId ?? "",
    approvalThresholdAmount: c.approvalThresholdAmount ?? "",
    requiredApprovalCount: String(c.requiredApprovalCount),
    changeOrderApprovalThresholdAmount: c.changeOrderApprovalThresholdAmount ?? "",
    changeOrderRequiredApprovalCount: String(c.changeOrderRequiredApprovalCount),
    budgetAlertThresholdPercent: String(c.budgetAlertThresholdPercent),
    lateFeePercentPerMonth: c.lateFeePercentPerMonth ?? "",
    payrollTaxBurdenPercent: c.payrollTaxBurdenPercent ?? "",
    workersCompBurdenPercent: c.workersCompBurdenPercent ?? "",
    benefitsBurdenPercent: c.benefitsBurdenPercent ?? "",
    otherBurdenPercent: c.otherBurdenPercent ?? "",
    requireSubcontractorPrequalification: c.requireSubcontractorPrequalification,
    subcontractorEmrThreshold: c.subcontractorEmrThreshold ?? "",
    defaultPaymentTermsDays: String(c.defaultPaymentTermsDays),
    rfiSlaDays: c.rfiSlaDays !== null ? String(c.rfiSlaDays) : "",
    punchListSlaDays: c.punchListSlaDays !== null ? String(c.punchListSlaDays) : "",
    submittalEscalationEnabled: c.submittalEscalationEnabled,
    inventoryCostingMethod: c.inventoryCostingMethod,
    rateCatalogApprovalThresholdPercent: c.rateCatalogApprovalThresholdPercent ?? "",
    npsDetractorFollowUpEnabled: c.npsDetractorFollowUpEnabled,
    invoiceRemindersEnabled: c.invoiceRemindersEnabled,
    leadFollowUpEnabled: c.leadFollowUpEnabled,
    estimateRemindersEnabled: c.estimateRemindersEnabled,
    changeOrderRemindersEnabled: c.changeOrderRemindersEnabled,
    enpsSurveysEnabled: c.enpsSurveysEnabled,
    workerSmsNotificationsEnabled: c.workerSmsNotificationsEnabled,
    reviewRequestUrl: c.reviewRequestUrl ?? "",
    reportingCurrency: c.reportingCurrency ?? "",
  };
}

/** The PATCH /company body for the form: blanks become null, counts fall back to their defaults. */
export function companyFormToPatch(form: CompanyForm) {
  return {
    name: form.name,
    locale: form.locale,
    brandColor: form.brandColor,
    address: form.address || null,
    city: form.city || null,
    postalCode: form.postalCode || null,
    vatId: form.vatId || null,
    iban: form.iban || null,
    datevConsultantNumber: form.datevConsultantNumber || null,
    datevClientNumber: form.datevClientNumber || null,
    datevFiscalYearStartMonth: form.datevFiscalYearStartMonth ? Number(form.datevFiscalYearStartMonth) : null,
    datevFiscalYearStartDay: form.datevFiscalYearStartDay ? Number(form.datevFiscalYearStartDay) : null,
    datevChartOfAccounts: form.datevChartOfAccounts || null,
    datevSachkontenlaenge: form.datevSachkontenlaenge ? Number(form.datevSachkontenlaenge) : null,
    datevReceivablesAccount: form.datevReceivablesAccount || null,
    datevPayablesAccount: form.datevPayablesAccount || null,
    datevRevenueAccountStandard: form.datevRevenueAccountStandard || null,
    datevRevenueAccountReduced: form.datevRevenueAccountReduced || null,
    datevRevenueAccountExempt: form.datevRevenueAccountExempt || null,
    datevExpenseAccountSubcontractors: form.datevExpenseAccountSubcontractors || null,
    peppolScheme: form.peppolScheme || null,
    peppolParticipantId: form.peppolParticipantId || null,
    approvalThresholdAmount: form.approvalThresholdAmount ? Number(form.approvalThresholdAmount) : null,
    requiredApprovalCount: Number(form.requiredApprovalCount) || 1,
    changeOrderApprovalThresholdAmount: form.changeOrderApprovalThresholdAmount
      ? Number(form.changeOrderApprovalThresholdAmount)
      : null,
    changeOrderRequiredApprovalCount: Number(form.changeOrderRequiredApprovalCount) || 1,
    budgetAlertThresholdPercent: Number(form.budgetAlertThresholdPercent) || 90,
    lateFeePercentPerMonth: form.lateFeePercentPerMonth ? Number(form.lateFeePercentPerMonth) : null,
    payrollTaxBurdenPercent: form.payrollTaxBurdenPercent ? Number(form.payrollTaxBurdenPercent) : null,
    workersCompBurdenPercent: form.workersCompBurdenPercent ? Number(form.workersCompBurdenPercent) : null,
    benefitsBurdenPercent: form.benefitsBurdenPercent ? Number(form.benefitsBurdenPercent) : null,
    otherBurdenPercent: form.otherBurdenPercent ? Number(form.otherBurdenPercent) : null,
    requireSubcontractorPrequalification: form.requireSubcontractorPrequalification,
    subcontractorEmrThreshold: form.subcontractorEmrThreshold ? Number(form.subcontractorEmrThreshold) : null,
    defaultPaymentTermsDays: Number(form.defaultPaymentTermsDays) || 30,
    rfiSlaDays: form.rfiSlaDays ? Number(form.rfiSlaDays) : null,
    punchListSlaDays: form.punchListSlaDays ? Number(form.punchListSlaDays) : null,
    submittalEscalationEnabled: form.submittalEscalationEnabled,
    inventoryCostingMethod: form.inventoryCostingMethod,
    rateCatalogApprovalThresholdPercent: form.rateCatalogApprovalThresholdPercent
      ? Number(form.rateCatalogApprovalThresholdPercent)
      : null,
    npsDetractorFollowUpEnabled: form.npsDetractorFollowUpEnabled,
    invoiceRemindersEnabled: form.invoiceRemindersEnabled,
    leadFollowUpEnabled: form.leadFollowUpEnabled,
    estimateRemindersEnabled: form.estimateRemindersEnabled,
    changeOrderRemindersEnabled: form.changeOrderRemindersEnabled,
    enpsSurveysEnabled: form.enpsSurveysEnabled,
    workerSmsNotificationsEnabled: form.workerSmsNotificationsEnabled,
    reviewRequestUrl: form.reviewRequestUrl || null,
    reportingCurrency: form.reportingCurrency || null,
  };
}

/** Typical SKR03/SKR04 account numbers, used only to pre-fill the settings form when the company
 * picks a chart of accounts — never assumed server-side. The customer's own Steuerberater may use
 * different numbers; these are starting points, not authoritative defaults. */
export const DATEV_ACCOUNT_SUGGESTIONS: Record<
  "skr03" | "skr04",
  { receivables: string; payables: string; revenueStandard: string; revenueReduced: string; revenueExempt: string; expenseSubcontractors: string }
> = {
  skr03: { receivables: "1400", payables: "1600", revenueStandard: "8400", revenueReduced: "8300", revenueExempt: "8120", expenseSubcontractors: "3300" },
  skr04: { receivables: "1200", payables: "3300", revenueStandard: "4400", revenueReduced: "4300", revenueExempt: "4120", expenseSubcontractors: "5900" },
};

/** What every section of the form gets: the shared form state, and whether it may be edited. */
export interface CompanyFormSectionProps {
  companyForm: CompanyForm;
  setCompanyForm: Dispatch<SetStateAction<CompanyForm>>;
  isManager: boolean;
}
