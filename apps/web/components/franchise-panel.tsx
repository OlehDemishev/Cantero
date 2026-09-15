"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

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
  const [franchiseOverview, setFranchiseOverview] = useState<FranchiseOverview | null>(null);
  const [franchiseLinkCode, setFranchiseLinkCode] = useState<string | null>(null);
  const [linkCodeInput, setLinkCodeInput] = useState("");
  const [franchiseBusy, setFranchiseBusy] = useState(false);
  const [franchiseError, setFranchiseError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<FranchiseOverview>("/company/franchise-overview").then(setFranchiseOverview);
  }, []);

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
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("franchise")}</h2>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{t("franchiseHint")}</p>

      {franchiseError && <p className="mb-3 text-xs text-red-600">{franchiseError}</p>}

      {franchiseOverview && franchiseOverview.branches.length > 0 ? (
        <>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("reportingIn", { currency: franchiseOverview.reportingCurrency ?? "" })}</p>
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-2">{tc("name")}</th>
                <th className="py-2">{t("branchRevenue")}</th>
                <th className="py-2">{t("branchCost")}</th>
                <th className="py-2">{t("branchMargin")}</th>
                <th className="py-2">{t("branchProjects")}</th>
                <th className="py-2">{t("branchMembers")}</th>
              </tr>
            </thead>
            <tbody>
              {franchiseOverview.branches.map((b) => (
                <tr key={b.companyId} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">{b.name}</td>
                  <td className="py-2">
                    {b.revenueConverted.toFixed(2)} {franchiseOverview.reportingCurrency}
                    {b.currency !== franchiseOverview.reportingCurrency && (
                      <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">
                        ({b.revenue.toFixed(2)} {b.currency})
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    {b.costConverted.toFixed(2)} {franchiseOverview.reportingCurrency}
                  </td>
                  <td className={`py-2 font-medium ${b.marginConverted >= 0 ? "text-success-700 dark:text-success-500" : "text-error-700 dark:text-error-500"}`}>
                    {b.marginConverted.toFixed(2)} {franchiseOverview.reportingCurrency}
                  </td>
                  <td className="py-2">{b.projectCount}</td>
                  <td className="py-2">{b.memberCount}</td>
                </tr>
              ))}
              {franchiseOverview.totals && (
                <tr className="font-medium text-gray-700 dark:text-gray-200">
                  <td className="py-2">{t("total")}</td>
                  <td className="py-2">
                    {franchiseOverview.totals.revenue.toFixed(2)} {franchiseOverview.reportingCurrency}
                  </td>
                  <td className="py-2">
                    {franchiseOverview.totals.cost.toFixed(2)} {franchiseOverview.reportingCurrency}
                  </td>
                  <td className={franchiseOverview.totals.margin >= 0 ? "py-2 text-success-700 dark:text-success-500" : "py-2 text-error-700 dark:text-error-500"}>
                    {franchiseOverview.totals.margin.toFixed(2)} {franchiseOverview.reportingCurrency}
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
              <p className="mt-2 font-mono text-xs text-gray-700 dark:text-gray-200">{franchiseLinkCode}</p>
            )}
          </div>
          <form onSubmit={linkToParentCompany} className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("linkToParentCode")}
              <input
                type="text"
                className="input mt-1"
                value={linkCodeInput}
                onChange={(e) => setLinkCodeInput(e.target.value)}
              />
            </label>
            <button type="submit" disabled={franchiseBusy || !linkCodeInput} className="btn-secondary">
              {t("linkToParent")}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
