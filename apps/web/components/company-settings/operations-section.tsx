"use client";

import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import type { CompanyFormSectionProps } from "./company-form";

/** SLA escalation, the inventory costing method and the rate catalog approval threshold. */
export function OperationsSection({ companyForm, setCompanyForm, isManager }: CompanyFormSectionProps) {
  const t = useTranslations("settings");

  return (
    <>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <p className="mb-2 text-xs font-medium text-fg-muted">{t("slaEscalation")}</p>
        <p className="mb-2 text-xs text-fg-subtle">{t("slaEscalationHint")}</p>
        <div className="flex gap-2">
          <Field label={t("rfiSlaDays")} size="sm" className="flex-1">
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
          </Field>
          <Field label={t("punchListSlaDays")} size="sm" className="flex-1">
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
          </Field>
        </div>
        <label className="mt-3 flex items-start gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={companyForm.submittalEscalationEnabled}
            onChange={(e) => setCompanyForm((f) => ({ ...f, submittalEscalationEnabled: e.target.checked }))}
            disabled={!isManager}
          />
          <span>
            <span className="font-medium text-fg-muted">{t("submittalEscalationEnabled")}</span>
            <span className="mt-0.5 block text-fg-subtle">{t("submittalEscalationEnabledHint")}</span>
          </span>
        </label>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <Field label={t("inventoryCostingMethod")} size="sm">
          <select
            className="input w-auto"
            value={companyForm.inventoryCostingMethod}
            onChange={(e) => setCompanyForm((f) => ({ ...f, inventoryCostingMethod: e.target.value as "fifo" | "weighted_average" }))}
            disabled={!isManager}
          >
            <option value="weighted_average">{t("costingMethod_weighted_average")}</option>
            <option value="fifo">{t("costingMethod_fifo")}</option>
          </select>
        </Field>
        <p className="mt-1 text-xs text-fg-subtle">{t("inventoryCostingMethodHint")}</p>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <Field label={t("rateCatalogApprovalThresholdPercent")} size="sm" className="w-48">
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
        </Field>
        <p className="mt-1 text-xs text-fg-subtle">{t("rateCatalogApprovalThresholdPercentHint")}</p>
      </div>
    </>
  );
}
