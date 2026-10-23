"use client";

import { useTranslations } from "next-intl";
import { HelpTooltip } from "@/components/help-tooltip";
import { Field } from "@/components/ui/field";
import type { CompanyFormSectionProps } from "./company-form";

/** Approval chains for spending and change orders, and the budget alert threshold. */
export function ApprovalsSection({ companyForm, setCompanyForm, isManager }: CompanyFormSectionProps) {
  const t = useTranslations("settings");

  return (
    <>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
          {t("approvalChains")}
          <HelpTooltip text={t("approvalChainsTooltip")} />
        </p>
        <p className="mb-2 text-xs text-fg-subtle">{t("approvalChainsHint")}</p>
        <div className="flex gap-2">
          <Field label={t("approvalThreshold")} size="sm" className="flex-1">
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
          </Field>
          <Field label={t("requiredApprovals")} size="sm" className="w-28">
            <input
              type="number"
              min="1"
              max="10"
              className="input"
              value={companyForm.requiredApprovalCount}
              onChange={(e) => setCompanyForm((f) => ({ ...f, requiredApprovalCount: e.target.value }))}
              disabled={!isManager || !companyForm.approvalThresholdAmount}
            />
          </Field>
        </div>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <p className="mb-2 text-xs font-medium text-fg-muted">{t("changeOrderApprovalChains")}</p>
        <p className="mb-2 text-xs text-fg-subtle">{t("changeOrderApprovalChainsHint")}</p>
        <div className="flex gap-2">
          <Field label={t("approvalThreshold")} size="sm" className="flex-1">
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
          </Field>
          <Field label={t("requiredApprovals")} size="sm" className="w-28">
            <input
              type="number"
              min="1"
              max="10"
              className="input"
              value={companyForm.changeOrderRequiredApprovalCount}
              onChange={(e) => setCompanyForm((f) => ({ ...f, changeOrderRequiredApprovalCount: e.target.value }))}
              disabled={!isManager || !companyForm.changeOrderApprovalThresholdAmount}
            />
          </Field>
        </div>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <Field label={t("budgetAlertThreshold")} size="sm" className="w-40">
          <input
            type="number"
            min="1"
            max="100"
            className="input"
            value={companyForm.budgetAlertThresholdPercent}
            onChange={(e) => setCompanyForm((f) => ({ ...f, budgetAlertThresholdPercent: e.target.value }))}
            disabled={!isManager}
          />
        </Field>
        <p className="mt-1 text-xs text-fg-subtle">{t("budgetAlertThresholdHint")}</p>
      </div>
    </>
  );
}
