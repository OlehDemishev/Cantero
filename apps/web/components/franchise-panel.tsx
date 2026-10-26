"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { formatCurrency } from "@/lib/format-currency";
import { Field, FormError } from "@/components/ui/field";

interface FranchiseBranch {
  companyId: string;
  name: string;
  currency: string;
  revenue: number;
  revenueConverted: number;
  materialsCost: number;
  laborCost: number;
  subcontractorCost: number;
  costConverted: number;
  marginConverted: number;
  projectCount: number;
  memberCount: number;
}
interface FranchiseOverview {
  branches: FranchiseBranch[];
  reportingCurrency?: string;
  totals?: { revenue: number; cost: number; margin: number; projectCount: number; memberCount: number };
}

export function FranchisePanel() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { data: franchiseOverview = null } = useApi<FranchiseOverview>("/company/franchise-overview");
  const [franchiseLinkCode, setFranchiseLinkCode] = useState<string | null>(null);
  const [linkCodeInput, setLinkCodeInput] = useState("");
  const [franchiseBusy, setFranchiseBusy] = useState(false);
  const [franchiseError, setFranchiseError] = useState<string | null>(null);

  async function generateFranchiseLinkCode() {
    setFranchiseBusy(true);
    setFranchiseError(null);
    try {
      const { franchiseLinkCode: code } = await apiFetch<{ franchiseLinkCode: string }>("/company/franchise-link-code", {
        method: "POST",
      });
      setFranchiseLinkCode(code);
    } catch (err) {
      setFranchiseError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setFranchiseBusy(false);
    }
  }

  async function linkToParentCompany(e: React.FormEvent) {
    e.preventDefault();
    setFranchiseBusy(true);
    setFranchiseError(null);
    try {
      await apiFetch("/company/link-to-parent", { method: "POST", body: JSON.stringify({ code: linkCodeInput }) });
      setLinkCodeInput("");
      window.location.reload();
    } catch (err) {
      setFranchiseError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setFranchiseBusy(false);
    }
  }

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("franchise")}</h2>
      <p className="mb-4 text-xs text-fg-subtle">{t("franchiseHint")}</p>

      {franchiseError && <FormError className="mb-3">{franchiseError}</FormError>}

      {franchiseOverview && franchiseOverview.branches.length > 0 ? (
        <>
          <p className="mb-2 text-xs text-fg-subtle">{t("reportingIn", { currency: franchiseOverview.reportingCurrency ?? "" })}</p>
          <div tabIndex={0} className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                <th scope="col" className="py-2">{tc("name")}</th>
                <th scope="col" className="py-2">{t("branchRevenue")}</th>
                <th scope="col" className="py-2">{t("branchCost")}</th>
                <th scope="col" className="py-2">{t("branchMargin")}</th>
                <th scope="col" className="py-2">{t("branchProjects")}</th>
                <th scope="col" className="py-2">{t("branchMembers")}</th>
              </tr>
            </thead>
            <tbody>
              {franchiseOverview.branches.map((b) => (
                <tr key={b.companyId} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">{b.name}</td>
                  <td className="py-2">
                    {formatCurrency(b.revenueConverted, franchiseOverview.reportingCurrency)}
                    {b.currency !== franchiseOverview.reportingCurrency && (
                      <span className="ml-1 text-xs text-fg-subtle">
                        ({formatCurrency(b.revenue, b.currency)})
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    {formatCurrency(b.costConverted, franchiseOverview.reportingCurrency)}
                  </td>
                  <td className={`py-2 font-medium ${b.marginConverted >= 0 ? "text-success-fg" : "text-danger-fg"}`}>
                    {formatCurrency(b.marginConverted, franchiseOverview.reportingCurrency)}
                  </td>
                  <td className="py-2">{b.projectCount}</td>
                  <td className="py-2">{b.memberCount}</td>
                </tr>
              ))}
              {franchiseOverview.totals && (
                <tr className="font-medium text-fg-muted">
                  <td className="py-2">{t("total")}</td>
                  <td className="py-2">
                    {formatCurrency(franchiseOverview.totals.revenue, franchiseOverview.reportingCurrency)}
                  </td>
                  <td className="py-2">
                    {formatCurrency(franchiseOverview.totals.cost, franchiseOverview.reportingCurrency)}
                  </td>
                  <td className={franchiseOverview.totals.margin >= 0 ? "py-2 text-success-fg" : "py-2 text-danger-fg"}>
                    {formatCurrency(franchiseOverview.totals.margin, franchiseOverview.reportingCurrency)}
                  </td>
                  <td className="py-2">{franchiseOverview.totals.projectCount}</td>
                  <td className="py-2">{franchiseOverview.totals.memberCount}</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <button type="button" onClick={generateFranchiseLinkCode} disabled={franchiseBusy} className="btn-secondary">
              {t("generateLinkCode")}
            </button>
            {franchiseLinkCode && (
              <p className="mt-2 font-mono text-xs text-fg-muted">{franchiseLinkCode}</p>
            )}
          </div>
          <form onSubmit={linkToParentCompany} className="flex items-end gap-2">
            <Field label={t("linkToParentCode")} size="sm">
              <input
                type="text"
                className="input"
                value={linkCodeInput}
                onChange={(e) => setLinkCodeInput(e.target.value)}
              />
            </Field>
            <button type="submit" disabled={franchiseBusy || !linkCodeInput} className="btn-secondary">
              {t("linkToParent")}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
