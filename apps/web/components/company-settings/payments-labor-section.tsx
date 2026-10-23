"use client";

import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import type { CompanyFormSectionProps } from "./company-form";

/** Payment terms and late fees, labor burden rates, and the subcontractor safety gate. */
export function PaymentsLaborSection({ companyForm, setCompanyForm, isManager }: CompanyFormSectionProps) {
  const t = useTranslations("settings");

  return (
    <>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <div className="flex gap-2">
          <Field label={t("defaultPaymentTermsDays")} size="sm" className="flex-1">
            <input
              type="number"
              min="0"
              max="365"
              className="input"
              value={companyForm.defaultPaymentTermsDays}
              onChange={(e) => setCompanyForm((f) => ({ ...f, defaultPaymentTermsDays: e.target.value }))}
              disabled={!isManager}
            />
          </Field>
          <Field label={t("lateFeePercentPerMonth")} size="sm" className="flex-1">
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
          </Field>
        </div>
        <p className="mt-1 text-xs text-fg-subtle">{t("lateFeeHint")}</p>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <p className="mb-2 text-xs font-medium text-fg-muted">{t("laborBurden")}</p>
        <p className="mb-2 text-xs text-fg-subtle">{t("laborBurdenHint")}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label={t("payrollTaxBurdenPercent")} size="sm">
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
          </Field>
          <Field label={t("workersCompBurdenPercent")} size="sm">
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
          </Field>
          <Field label={t("benefitsBurdenPercent")} size="sm">
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
          </Field>
          <Field label={t("otherBurdenPercent")} size="sm">
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
          </Field>
        </div>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <p className="mb-2 text-xs font-medium text-fg-muted">{t("subcontractorSafetyGate")}</p>
        <p className="mb-2 text-xs text-fg-subtle">{t("subcontractorSafetyGateHint")}</p>
        <label className="mb-2 flex items-center gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={companyForm.requireSubcontractorPrequalification}
            onChange={(e) => setCompanyForm((f) => ({ ...f, requireSubcontractorPrequalification: e.target.checked }))}
            disabled={!isManager}
          />
          {t("requireSubcontractorPrequalification")}
        </label>
        <Field label={t("subcontractorEmrThreshold")} size="sm" className="w-48">
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
        </Field>
      </div>
    </>
  );
}
