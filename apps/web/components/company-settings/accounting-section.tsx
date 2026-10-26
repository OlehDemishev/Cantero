"use client";

import { useTranslations } from "next-intl";
import { HelpTooltip } from "@/components/help-tooltip";
import { Field } from "@/components/ui/field";
import { DATEV_ACCOUNT_SUGGESTIONS, type CompanyFormSectionProps } from "./company-form";

/** E-invoicing details, the DATEV export settings and the Peppol participant. */
export function AccountingSection({ companyForm, setCompanyForm, isManager }: CompanyFormSectionProps) {
  const t = useTranslations("settings");

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

  return (
    <>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
          {t("eInvoicing")}
          <HelpTooltip text={t("eInvoicingTooltip")} />
        </p>
        <p className="mb-2 text-xs text-fg-subtle">{t("eInvoicingHint")}</p>
        <div className="flex flex-col gap-2">
          <input
            className="input"
            placeholder={t("streetAddress")} aria-label={t("streetAddress")}
            value={companyForm.address}
            onChange={(e) => setCompanyForm((f) => ({ ...f, address: e.target.value }))}
            disabled={!isManager}
          />
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={t("city")} aria-label={t("city")}
              value={companyForm.city}
              onChange={(e) => setCompanyForm((f) => ({ ...f, city: e.target.value }))}
              disabled={!isManager}
            />
            <input
              className="input w-28"
              placeholder={t("postalCode")} aria-label={t("postalCode")}
              value={companyForm.postalCode}
              onChange={(e) => setCompanyForm((f) => ({ ...f, postalCode: e.target.value }))}
              disabled={!isManager}
            />
          </div>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={t("vatIdPlaceholder")} aria-label={t("vatIdPlaceholder")}
              value={companyForm.vatId}
              onChange={(e) => setCompanyForm((f) => ({ ...f, vatId: e.target.value }))}
              disabled={!isManager}
            />
            <input
              className="input flex-1"
              placeholder={t("ibanPlaceholder")} aria-label={t("ibanPlaceholder")}
              value={companyForm.iban}
              onChange={(e) => setCompanyForm((f) => ({ ...f, iban: e.target.value }))}
              disabled={!isManager}
            />
          </div>
        </div>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
          {t("datevSettings")}
          <HelpTooltip text={t("datevSettingsTooltip")} />
        </p>
        <p className="mb-2 text-xs text-fg-subtle">{t("datevSettingsHint")}</p>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={t("beraternummer")} aria-label={t("beraternummer")}
              value={companyForm.datevConsultantNumber}
              onChange={(e) => setCompanyForm((f) => ({ ...f, datevConsultantNumber: e.target.value }))}
              disabled={!isManager}
            />
            <input
              className="input flex-1"
              placeholder={t("mandantennummer")} aria-label={t("mandantennummer")}
              value={companyForm.datevClientNumber}
              onChange={(e) => setCompanyForm((f) => ({ ...f, datevClientNumber: e.target.value }))}
              disabled={!isManager}
            />
          </div>
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
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
          <Field label={t("chartOfAccounts")} size="sm">
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
          </Field>
          <input
            type="number"
            className="input w-28"
            placeholder={t("sachkontenlaenge")} aria-label={t("sachkontenlaenge")}
            value={companyForm.datevSachkontenlaenge}
            onChange={(e) => setCompanyForm((f) => ({ ...f, datevSachkontenlaenge: e.target.value }))}
            disabled={!isManager}
          />
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={t("receivablesAccount")} aria-label={t("receivablesAccount")}
              value={companyForm.datevReceivablesAccount}
              onChange={(e) => setCompanyForm((f) => ({ ...f, datevReceivablesAccount: e.target.value }))}
              disabled={!isManager}
            />
            <input
              className="input flex-1"
              placeholder={t("payablesAccount")} aria-label={t("payablesAccount")}
              value={companyForm.datevPayablesAccount}
              onChange={(e) => setCompanyForm((f) => ({ ...f, datevPayablesAccount: e.target.value }))}
              disabled={!isManager}
            />
          </div>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={t("revenueAccountStandard")} aria-label={t("revenueAccountStandard")}
              value={companyForm.datevRevenueAccountStandard}
              onChange={(e) => setCompanyForm((f) => ({ ...f, datevRevenueAccountStandard: e.target.value }))}
              disabled={!isManager}
            />
            <input
              className="input flex-1"
              placeholder={t("revenueAccountReduced")} aria-label={t("revenueAccountReduced")}
              value={companyForm.datevRevenueAccountReduced}
              onChange={(e) => setCompanyForm((f) => ({ ...f, datevRevenueAccountReduced: e.target.value }))}
              disabled={!isManager}
            />
            <input
              className="input flex-1"
              placeholder={t("revenueAccountExempt")} aria-label={t("revenueAccountExempt")}
              value={companyForm.datevRevenueAccountExempt}
              onChange={(e) => setCompanyForm((f) => ({ ...f, datevRevenueAccountExempt: e.target.value }))}
              disabled={!isManager}
            />
          </div>
          <input
            className="input"
            placeholder={t("expenseAccountSubcontractors")} aria-label={t("expenseAccountSubcontractors")}
            value={companyForm.datevExpenseAccountSubcontractors}
            onChange={(e) => setCompanyForm((f) => ({ ...f, datevExpenseAccountSubcontractors: e.target.value }))}
            disabled={!isManager}
          />
        </div>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
          {t("peppolSettings")}
          <HelpTooltip text={t("peppolSettingsHint")} />
        </p>
        <div className="flex gap-2">
          <input
            className="input w-32"
            placeholder={t("peppolScheme")} aria-label={t("peppolScheme")}
            value={companyForm.peppolScheme}
            onChange={(e) => setCompanyForm((f) => ({ ...f, peppolScheme: e.target.value }))}
            disabled={!isManager}
          />
          <input
            className="input flex-1"
            placeholder={t("peppolParticipantId")} aria-label={t("peppolParticipantId")}
            value={companyForm.peppolParticipantId}
            onChange={(e) => setCompanyForm((f) => ({ ...f, peppolParticipantId: e.target.value }))}
            disabled={!isManager}
          />
        </div>
      </div>
    </>
  );
}
