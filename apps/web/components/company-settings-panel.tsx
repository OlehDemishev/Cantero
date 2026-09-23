"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LOCALE_NAMES, SUPPORTED_LOCALES, SUPPORTED_CURRENCIES } from "@cantero/shared";
import { apiFetch, apiUpload } from "@/lib/api-client";
import { HelpTooltip } from "@/components/help-tooltip";
import { CompanyHolidaysPanel } from "@/components/company-holidays-panel";

interface Company {
  name: string;
  locale: string;
  brandColor: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  vatId: string | null;
  iban: string | null;
  datevConsultantNumber: string | null;
  datevClientNumber: string | null;
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

/** Typical SKR03/SKR04 account numbers, used only to pre-fill the settings form when the company
 * picks a chart of accounts — never assumed server-side. The customer's own Steuerberater may use
 * different numbers; these are starting points, not authoritative defaults. */
const DATEV_ACCOUNT_SUGGESTIONS: Record<
  "skr03" | "skr04",
  { receivables: string; payables: string; revenueStandard: string; revenueReduced: string; revenueExempt: string; expenseSubcontractors: string }
> = {
  skr03: { receivables: "1400", payables: "1600", revenueStandard: "8400", revenueReduced: "8300", revenueExempt: "8120", expenseSubcontractors: "3300" },
  skr04: { receivables: "1200", payables: "3300", revenueStandard: "4400", revenueReduced: "4300", revenueExempt: "4120", expenseSubcontractors: "5900" },
};

export function CompanySettingsPanel({ isManager }: { isManager: boolean }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  const [companyForm, setCompanyForm] = useState<{
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
  }>({
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
  });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enpsBusy, setEnpsBusy] = useState(false);
  const [enpsSentMessage, setEnpsSentMessage] = useState<string | null>(null);

  function loadLogo() {
    apiFetch<Blob>("/company/logo")
      .then((blob) => setLogoUrl(URL.createObjectURL(blob)))
      .catch(() => setLogoUrl(null));
  }

  useEffect(() => {
    apiFetch<Company>("/company").then((c) => {
      setCompanyForm({
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
      });
    });
    loadLogo();
  }, []);

  async function sendEnpsNow() {
    setEnpsBusy(true);
    setEnpsSentMessage(null);
    try {
      const result = await apiFetch<{ sent: number }>("/enps-surveys/send-now", { method: "POST" });
      setEnpsSentMessage(t("enpsSentCount", { count: result.sent }));
    } finally {
      setEnpsBusy(false);
    }
  }

  async function saveCompany(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/company", {
        method: "PATCH",
        body: JSON.stringify({
          name: companyForm.name,
          locale: companyForm.locale,
          brandColor: companyForm.brandColor,
          address: companyForm.address || null,
          city: companyForm.city || null,
          postalCode: companyForm.postalCode || null,
          vatId: companyForm.vatId || null,
          iban: companyForm.iban || null,
          datevConsultantNumber: companyForm.datevConsultantNumber || null,
          datevClientNumber: companyForm.datevClientNumber || null,
          datevFiscalYearStartMonth: companyForm.datevFiscalYearStartMonth ? Number(companyForm.datevFiscalYearStartMonth) : null,
          datevFiscalYearStartDay: companyForm.datevFiscalYearStartDay ? Number(companyForm.datevFiscalYearStartDay) : null,
          datevChartOfAccounts: companyForm.datevChartOfAccounts || null,
          datevSachkontenlaenge: companyForm.datevSachkontenlaenge ? Number(companyForm.datevSachkontenlaenge) : null,
          datevReceivablesAccount: companyForm.datevReceivablesAccount || null,
          datevPayablesAccount: companyForm.datevPayablesAccount || null,
          datevRevenueAccountStandard: companyForm.datevRevenueAccountStandard || null,
          datevRevenueAccountReduced: companyForm.datevRevenueAccountReduced || null,
          datevRevenueAccountExempt: companyForm.datevRevenueAccountExempt || null,
          datevExpenseAccountSubcontractors: companyForm.datevExpenseAccountSubcontractors || null,
          peppolScheme: companyForm.peppolScheme || null,
          peppolParticipantId: companyForm.peppolParticipantId || null,
          approvalThresholdAmount: companyForm.approvalThresholdAmount ? Number(companyForm.approvalThresholdAmount) : null,
          requiredApprovalCount: Number(companyForm.requiredApprovalCount) || 1,
          changeOrderApprovalThresholdAmount: companyForm.changeOrderApprovalThresholdAmount
            ? Number(companyForm.changeOrderApprovalThresholdAmount)
            : null,
          changeOrderRequiredApprovalCount: Number(companyForm.changeOrderRequiredApprovalCount) || 1,
          budgetAlertThresholdPercent: Number(companyForm.budgetAlertThresholdPercent) || 90,
          lateFeePercentPerMonth: companyForm.lateFeePercentPerMonth ? Number(companyForm.lateFeePercentPerMonth) : null,
          payrollTaxBurdenPercent: companyForm.payrollTaxBurdenPercent ? Number(companyForm.payrollTaxBurdenPercent) : null,
          workersCompBurdenPercent: companyForm.workersCompBurdenPercent ? Number(companyForm.workersCompBurdenPercent) : null,
          benefitsBurdenPercent: companyForm.benefitsBurdenPercent ? Number(companyForm.benefitsBurdenPercent) : null,
          otherBurdenPercent: companyForm.otherBurdenPercent ? Number(companyForm.otherBurdenPercent) : null,
          requireSubcontractorPrequalification: companyForm.requireSubcontractorPrequalification,
          subcontractorEmrThreshold: companyForm.subcontractorEmrThreshold ? Number(companyForm.subcontractorEmrThreshold) : null,
          defaultPaymentTermsDays: Number(companyForm.defaultPaymentTermsDays) || 30,
          rfiSlaDays: companyForm.rfiSlaDays ? Number(companyForm.rfiSlaDays) : null,
          punchListSlaDays: companyForm.punchListSlaDays ? Number(companyForm.punchListSlaDays) : null,
          submittalEscalationEnabled: companyForm.submittalEscalationEnabled,
          inventoryCostingMethod: companyForm.inventoryCostingMethod,
          rateCatalogApprovalThresholdPercent: companyForm.rateCatalogApprovalThresholdPercent
            ? Number(companyForm.rateCatalogApprovalThresholdPercent)
            : null,
          npsDetractorFollowUpEnabled: companyForm.npsDetractorFollowUpEnabled,
          invoiceRemindersEnabled: companyForm.invoiceRemindersEnabled,
          leadFollowUpEnabled: companyForm.leadFollowUpEnabled,
          estimateRemindersEnabled: companyForm.estimateRemindersEnabled,
          changeOrderRemindersEnabled: companyForm.changeOrderRemindersEnabled,
          enpsSurveysEnabled: companyForm.enpsSurveysEnabled,
          workerSmsNotificationsEnabled: companyForm.workerSmsNotificationsEnabled,
          reviewRequestUrl: companyForm.reviewRequestUrl || null,
          reportingCurrency: companyForm.reportingCurrency || null,
        }),
      });
      // The company's language applies to whoever hasn't picked their own (Settings → Account).
      const me = await apiFetch<{ locale: string }>("/me");
      document.cookie = `NEXT_LOCALE=${me.locale};path=/;max-age=31536000`;
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  /** Pre-fills the six account-number inputs with typical values for the chosen chart of
   * accounts — still editable, still requires the form's own Save click, never silently applied. */
  function pickDatevChartOfAccounts(value: "" | "skr03" | "skr04") {
    setCompanyForm((f) => {
      if (!value) return { ...f, datevChartOfAccounts: value };
      const suggestions = DATEV_ACCOUNT_SUGGESTIONS[value];
      return {
        ...f,
        datevChartOfAccounts: value,
        datevReceivablesAccount: f.datevReceivablesAccount || suggestions.receivables,
        datevPayablesAccount: f.datevPayablesAccount || suggestions.payables,
        datevRevenueAccountStandard: f.datevRevenueAccountStandard || suggestions.revenueStandard,
        datevRevenueAccountReduced: f.datevRevenueAccountReduced || suggestions.revenueReduced,
        datevRevenueAccountExempt: f.datevRevenueAccountExempt || suggestions.revenueExempt,
        datevExpenseAccountSubcontractors: f.datevExpenseAccountSubcontractors || suggestions.expenseSubcontractors,
        datevSachkontenlaenge: f.datevSachkontenlaenge || "4",
      };
    });
  }

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoBusy(true);
    setLogoError(null);
    try {
      await apiUpload("/company/logo", file);
      loadLogo();
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setLogoBusy(false);
      e.target.value = "";
    }
  }

  return (
    <section className="card">
      <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("company")}</h2>
      {!isManager && <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("companySettingsManagerOnlyHint")}</p>}
      {error && <p className="mb-3 rounded-md bg-red-50 dark:bg-red-500/15 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      <form onSubmit={saveCompany} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("companyName")}
          <input
            required
            className="input mt-1"
            value={companyForm.name}
            onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))}
            disabled={!isManager}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("language")}
          <select
            className="input mt-1"
            value={companyForm.locale}
            onChange={(e) => setCompanyForm((f) => ({ ...f, locale: e.target.value }))}
            disabled={!isManager}
          >
            {SUPPORTED_LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </select>
        </label>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-200">
            {t("eInvoicing")}
            <HelpTooltip text={t("eInvoicingTooltip")} />
          </p>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("eInvoicingHint")}</p>
          <div className="flex flex-col gap-2">
            <input
              className="input"
              placeholder={t("streetAddress")}
              value={companyForm.address}
              onChange={(e) => setCompanyForm((f) => ({ ...f, address: e.target.value }))}
              disabled={!isManager}
            />
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder={t("city")}
                value={companyForm.city}
                onChange={(e) => setCompanyForm((f) => ({ ...f, city: e.target.value }))}
                disabled={!isManager}
              />
              <input
                className="input w-28"
                placeholder={t("postalCode")}
                value={companyForm.postalCode}
                onChange={(e) => setCompanyForm((f) => ({ ...f, postalCode: e.target.value }))}
                disabled={!isManager}
              />
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder={t("vatIdPlaceholder")}
                value={companyForm.vatId}
                onChange={(e) => setCompanyForm((f) => ({ ...f, vatId: e.target.value }))}
                disabled={!isManager}
              />
              <input
                className="input flex-1"
                placeholder={t("ibanPlaceholder")}
                value={companyForm.iban}
                onChange={(e) => setCompanyForm((f) => ({ ...f, iban: e.target.value }))}
                disabled={!isManager}
              />
            </div>
          </div>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-200">
            {t("datevSettings")}
            <HelpTooltip text={t("datevSettingsTooltip")} />
          </p>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("datevSettingsHint")}</p>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder={t("beraternummer")}
                value={companyForm.datevConsultantNumber}
                onChange={(e) => setCompanyForm((f) => ({ ...f, datevConsultantNumber: e.target.value }))}
                disabled={!isManager}
              />
              <input
                className="input flex-1"
                placeholder={t("mandantennummer")}
                value={companyForm.datevClientNumber}
                onChange={(e) => setCompanyForm((f) => ({ ...f, datevClientNumber: e.target.value }))}
                disabled={!isManager}
              />
            </div>
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("fiscalYearStart")}
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  max="12"
                  className="input w-20"
                  placeholder={t("month")}
                  value={companyForm.datevFiscalYearStartMonth}
                  onChange={(e) => setCompanyForm((f) => ({ ...f, datevFiscalYearStartMonth: e.target.value }))}
                  disabled={!isManager}
                />
                <input
                  type="number"
                  min="1"
                  max="31"
                  className="input w-20"
                  placeholder={t("day")}
                  value={companyForm.datevFiscalYearStartDay}
                  onChange={(e) => setCompanyForm((f) => ({ ...f, datevFiscalYearStartDay: e.target.value }))}
                  disabled={!isManager}
                />
              </div>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("chartOfAccounts")}
              <select
                className="input"
                value={companyForm.datevChartOfAccounts}
                onChange={(e) => pickDatevChartOfAccounts(e.target.value as "" | "skr03" | "skr04")}
                disabled={!isManager}
              >
                <option value="">—</option>
                <option value="skr03">SKR03</option>
                <option value="skr04">SKR04</option>
              </select>
            </label>
            <input
              type="number"
              className="input w-28"
              placeholder={t("sachkontenlaenge")}
              value={companyForm.datevSachkontenlaenge}
              onChange={(e) => setCompanyForm((f) => ({ ...f, datevSachkontenlaenge: e.target.value }))}
              disabled={!isManager}
            />
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder={t("receivablesAccount")}
                value={companyForm.datevReceivablesAccount}
                onChange={(e) => setCompanyForm((f) => ({ ...f, datevReceivablesAccount: e.target.value }))}
                disabled={!isManager}
              />
              <input
                className="input flex-1"
                placeholder={t("payablesAccount")}
                value={companyForm.datevPayablesAccount}
                onChange={(e) => setCompanyForm((f) => ({ ...f, datevPayablesAccount: e.target.value }))}
                disabled={!isManager}
              />
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder={t("revenueAccountStandard")}
                value={companyForm.datevRevenueAccountStandard}
                onChange={(e) => setCompanyForm((f) => ({ ...f, datevRevenueAccountStandard: e.target.value }))}
                disabled={!isManager}
              />
              <input
                className="input flex-1"
                placeholder={t("revenueAccountReduced")}
                value={companyForm.datevRevenueAccountReduced}
                onChange={(e) => setCompanyForm((f) => ({ ...f, datevRevenueAccountReduced: e.target.value }))}
                disabled={!isManager}
              />
              <input
                className="input flex-1"
                placeholder={t("revenueAccountExempt")}
                value={companyForm.datevRevenueAccountExempt}
                onChange={(e) => setCompanyForm((f) => ({ ...f, datevRevenueAccountExempt: e.target.value }))}
                disabled={!isManager}
              />
            </div>
            <input
              className="input"
              placeholder={t("expenseAccountSubcontractors")}
              value={companyForm.datevExpenseAccountSubcontractors}
              onChange={(e) => setCompanyForm((f) => ({ ...f, datevExpenseAccountSubcontractors: e.target.value }))}
              disabled={!isManager}
            />
          </div>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-200">
            {t("peppolSettings")}
            <HelpTooltip text={t("peppolSettingsHint")} />
          </p>
          <div className="flex gap-2">
            <input
              className="input w-32"
              placeholder={t("peppolScheme")}
              value={companyForm.peppolScheme}
              onChange={(e) => setCompanyForm((f) => ({ ...f, peppolScheme: e.target.value }))}
              disabled={!isManager}
            />
            <input
              className="input flex-1"
              placeholder={t("peppolParticipantId")}
              value={companyForm.peppolParticipantId}
              onChange={(e) => setCompanyForm((f) => ({ ...f, peppolParticipantId: e.target.value }))}
              disabled={!isManager}
            />
          </div>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-200">
            {t("approvalChains")}
            <HelpTooltip text={t("approvalChainsTooltip")} />
          </p>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("approvalChainsHint")}</p>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("approvalThreshold")}
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={t("approvalThresholdPlaceholder")}
                className="input"
                value={companyForm.approvalThresholdAmount}
                onChange={(e) => setCompanyForm((f) => ({ ...f, approvalThresholdAmount: e.target.value }))}
                disabled={!isManager}
              />
            </label>
            <label className="flex w-28 flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("requiredApprovals")}
              <input
                type="number"
                min="1"
                max="10"
                className="input"
                value={companyForm.requiredApprovalCount}
                onChange={(e) => setCompanyForm((f) => ({ ...f, requiredApprovalCount: e.target.value }))}
                disabled={!isManager || !companyForm.approvalThresholdAmount}
              />
            </label>
          </div>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-200">{t("changeOrderApprovalChains")}</p>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("changeOrderApprovalChainsHint")}</p>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("approvalThreshold")}
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={t("approvalThresholdPlaceholder")}
                className="input"
                value={companyForm.changeOrderApprovalThresholdAmount}
                onChange={(e) => setCompanyForm((f) => ({ ...f, changeOrderApprovalThresholdAmount: e.target.value }))}
                disabled={!isManager}
              />
            </label>
            <label className="flex w-28 flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("requiredApprovals")}
              <input
                type="number"
                min="1"
                max="10"
                className="input"
                value={companyForm.changeOrderRequiredApprovalCount}
                onChange={(e) => setCompanyForm((f) => ({ ...f, changeOrderRequiredApprovalCount: e.target.value }))}
                disabled={!isManager || !companyForm.changeOrderApprovalThresholdAmount}
              />
            </label>
          </div>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <label className="flex w-40 flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
            {t("budgetAlertThreshold")}
            <input
              type="number"
              min="1"
              max="100"
              className="input"
              value={companyForm.budgetAlertThresholdPercent}
              onChange={(e) => setCompanyForm((f) => ({ ...f, budgetAlertThresholdPercent: e.target.value }))}
              disabled={!isManager}
            />
          </label>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("budgetAlertThresholdHint")}</p>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("defaultPaymentTermsDays")}
              <input
                type="number"
                min="0"
                max="365"
                className="input"
                value={companyForm.defaultPaymentTermsDays}
                onChange={(e) => setCompanyForm((f) => ({ ...f, defaultPaymentTermsDays: e.target.value }))}
                disabled={!isManager}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("lateFeePercentPerMonth")}
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                placeholder={t("lateFeeDisabledPlaceholder")}
                className="input"
                value={companyForm.lateFeePercentPerMonth}
                onChange={(e) => setCompanyForm((f) => ({ ...f, lateFeePercentPerMonth: e.target.value }))}
                disabled={!isManager}
              />
            </label>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("lateFeeHint")}</p>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-200">{t("laborBurden")}</p>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("laborBurdenHint")}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("payrollTaxBurdenPercent")}
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                className="input"
                value={companyForm.payrollTaxBurdenPercent}
                onChange={(e) => setCompanyForm((f) => ({ ...f, payrollTaxBurdenPercent: e.target.value }))}
                disabled={!isManager}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("workersCompBurdenPercent")}
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                className="input"
                value={companyForm.workersCompBurdenPercent}
                onChange={(e) => setCompanyForm((f) => ({ ...f, workersCompBurdenPercent: e.target.value }))}
                disabled={!isManager}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("benefitsBurdenPercent")}
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                className="input"
                value={companyForm.benefitsBurdenPercent}
                onChange={(e) => setCompanyForm((f) => ({ ...f, benefitsBurdenPercent: e.target.value }))}
                disabled={!isManager}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("otherBurdenPercent")}
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                className="input"
                value={companyForm.otherBurdenPercent}
                onChange={(e) => setCompanyForm((f) => ({ ...f, otherBurdenPercent: e.target.value }))}
                disabled={!isManager}
              />
            </label>
          </div>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-200">{t("subcontractorSafetyGate")}</p>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("subcontractorSafetyGateHint")}</p>
          <label className="mb-2 flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={companyForm.requireSubcontractorPrequalification}
              onChange={(e) => setCompanyForm((f) => ({ ...f, requireSubcontractorPrequalification: e.target.checked }))}
              disabled={!isManager}
            />
            {t("requireSubcontractorPrequalification")}
          </label>
          <label className="flex w-48 flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
            {t("subcontractorEmrThreshold")}
            <input
              type="number"
              min="0"
              max="99.99"
              step="0.01"
              placeholder={t("emrThresholdDisabledPlaceholder")}
              className="input"
              value={companyForm.subcontractorEmrThreshold}
              onChange={(e) => setCompanyForm((f) => ({ ...f, subcontractorEmrThreshold: e.target.value }))}
              disabled={!isManager}
            />
          </label>
        </div>
        <CompanyHolidaysPanel canManage={isManager} />
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-200">{t("slaEscalation")}</p>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("slaEscalationHint")}</p>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("rfiSlaDays")}
              <input
                type="number"
                min="1"
                max="365"
                placeholder={t("slaDaysPlaceholder")}
                className="input"
                value={companyForm.rfiSlaDays}
                onChange={(e) => setCompanyForm((f) => ({ ...f, rfiSlaDays: e.target.value }))}
                disabled={!isManager}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("punchListSlaDays")}
              <input
                type="number"
                min="1"
                max="365"
                placeholder={t("slaDaysPlaceholder")}
                className="input"
                value={companyForm.punchListSlaDays}
                onChange={(e) => setCompanyForm((f) => ({ ...f, punchListSlaDays: e.target.value }))}
                disabled={!isManager}
              />
            </label>
          </div>
          <label className="mt-3 flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={companyForm.submittalEscalationEnabled}
              onChange={(e) => setCompanyForm((f) => ({ ...f, submittalEscalationEnabled: e.target.checked }))}
              disabled={!isManager}
            />
            <span>
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("submittalEscalationEnabled")}</span>
              <span className="mt-0.5 block text-gray-500 dark:text-gray-400">{t("submittalEscalationEnabledHint")}</span>
            </span>
          </label>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
            {t("inventoryCostingMethod")}
            <select
              className="input w-auto"
              value={companyForm.inventoryCostingMethod}
              onChange={(e) => setCompanyForm((f) => ({ ...f, inventoryCostingMethod: e.target.value as "fifo" | "weighted_average" }))}
              disabled={!isManager}
            >
              <option value="weighted_average">{t("costingMethod_weighted_average")}</option>
              <option value="fifo">{t("costingMethod_fifo")}</option>
            </select>
          </label>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("inventoryCostingMethodHint")}</p>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <label className="flex w-48 flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
            {t("rateCatalogApprovalThresholdPercent")}
            <input
              type="number"
              min="0"
              step="1"
              placeholder={t("noThresholdPlaceholder")}
              className="input"
              value={companyForm.rateCatalogApprovalThresholdPercent}
              onChange={(e) => setCompanyForm((f) => ({ ...f, rateCatalogApprovalThresholdPercent: e.target.value }))}
              disabled={!isManager}
            />
          </label>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("rateCatalogApprovalThresholdPercentHint")}</p>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={companyForm.npsDetractorFollowUpEnabled}
              onChange={(e) => setCompanyForm((f) => ({ ...f, npsDetractorFollowUpEnabled: e.target.checked }))}
              disabled={!isManager}
            />
            <span>
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("npsDetractorFollowUpEnabled")}</span>
              <span className="mt-0.5 block text-gray-500 dark:text-gray-400">{t("npsDetractorFollowUpEnabledHint")}</span>
            </span>
          </label>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={companyForm.invoiceRemindersEnabled}
              onChange={(e) => setCompanyForm((f) => ({ ...f, invoiceRemindersEnabled: e.target.checked }))}
              disabled={!isManager}
            />
            <span>
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("invoiceReminders")}</span>
              <span className="mt-0.5 block text-gray-500 dark:text-gray-400">{t("invoiceRemindersHint")}</span>
            </span>
          </label>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={companyForm.estimateRemindersEnabled}
              onChange={(e) => setCompanyForm((f) => ({ ...f, estimateRemindersEnabled: e.target.checked }))}
              disabled={!isManager}
            />
            <span>
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("estimateReminders")}</span>
              <span className="mt-0.5 block text-gray-500 dark:text-gray-400">{t("estimateRemindersHint")}</span>
            </span>
          </label>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={companyForm.changeOrderRemindersEnabled}
              onChange={(e) => setCompanyForm((f) => ({ ...f, changeOrderRemindersEnabled: e.target.checked }))}
              disabled={!isManager}
            />
            <span>
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("changeOrderReminders")}</span>
              <span className="mt-0.5 block text-gray-500 dark:text-gray-400">{t("changeOrderRemindersHint")}</span>
            </span>
          </label>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={companyForm.enpsSurveysEnabled}
              onChange={(e) => setCompanyForm((f) => ({ ...f, enpsSurveysEnabled: e.target.checked }))}
              disabled={!isManager}
            />
            <span>
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("enpsSurveys")}</span>
              <span className="mt-0.5 block text-gray-500 dark:text-gray-400">{t("enpsSurveysHint")}</span>
            </span>
          </label>
          {companyForm.enpsSurveysEnabled && (
            <button type="button" onClick={sendEnpsNow} disabled={enpsBusy} className="btn-secondary mt-2 px-2 py-1 text-xs">
              {enpsSentMessage ?? t("enpsSendNow")}
            </button>
          )}
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={companyForm.workerSmsNotificationsEnabled}
              onChange={(e) => setCompanyForm((f) => ({ ...f, workerSmsNotificationsEnabled: e.target.checked }))}
              disabled={!isManager}
            />
            <span>
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("workerSmsNotifications")}</span>
              <span className="mt-0.5 block text-gray-500 dark:text-gray-400">{t("workerSmsNotificationsHint")}</span>
            </span>
          </label>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={companyForm.leadFollowUpEnabled}
              onChange={(e) => setCompanyForm((f) => ({ ...f, leadFollowUpEnabled: e.target.checked }))}
              disabled={!isManager}
            />
            <span>
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("leadFollowUp")}</span>
              <span className="mt-0.5 block text-gray-500 dark:text-gray-400">{t("leadFollowUpHint")}</span>
            </span>
          </label>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <label className="flex flex-col gap-1 text-xs text-gray-700 dark:text-gray-200">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("reviewRequestUrl")}</span>
            <span className="text-gray-500 dark:text-gray-400">{t("reviewRequestUrlHint")}</span>
            <input
              type="url"
              className="input mt-1"
              placeholder="https://g.page/r/your-business/review"
              value={companyForm.reviewRequestUrl}
              onChange={(e) => setCompanyForm((f) => ({ ...f, reviewRequestUrl: e.target.value }))}
              disabled={!isManager}
            />
          </label>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <label className="flex flex-col gap-1 text-xs text-gray-700 dark:text-gray-200">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("reportingCurrency")}</span>
            <span className="text-gray-500 dark:text-gray-400">{t("reportingCurrencyHint")}</span>
            <select
              className="input mt-1"
              value={companyForm.reportingCurrency}
              onChange={(e) => setCompanyForm((f) => ({ ...f, reportingCurrency: e.target.value }))}
              disabled={!isManager}
            >
              <option value="">{tc("none")}</option>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        {isManager && (
          <button type="submit" disabled={busy} className="btn-primary">
            {t("save")}
          </button>
        )}
      </form>

      <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-4">
        <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("branding")}</h3>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("brandingHint")}</p>
        {logoError && <p className="mb-3 rounded-md bg-red-50 dark:bg-red-500/15 px-3 py-2 text-sm text-red-700 dark:text-red-400">{logoError}</p>}
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
            {t("brandColor")}
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                className="h-9 w-14 cursor-pointer rounded border border-gray-200 dark:border-gray-700"
                value={companyForm.brandColor ?? "#465fff"}
                onChange={(e) => setCompanyForm((f) => ({ ...f, brandColor: e.target.value }))}
                disabled={!isManager}
              />
              {companyForm.brandColor && isManager && (
                <button
                  type="button"
                  onClick={() => setCompanyForm((f) => ({ ...f, brandColor: null }))}
                  className="btn-secondary px-2 py-1 text-xs"
                >
                  {t("resetBrandColor")}
                </button>
              )}
            </div>
          </label>
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt={t("logo")} className="h-12 max-w-[120px] rounded border border-gray-200 dark:border-gray-700 object-contain" />
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500">{t("noLogo")}</span>
            )}
            {isManager && (
              <label className="btn-secondary cursor-pointer px-3 py-1 text-xs">
                {logoBusy ? tc("loading") : t("uploadLogo")}
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={uploadLogo} disabled={logoBusy} />
              </label>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
