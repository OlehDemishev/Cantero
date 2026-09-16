"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { SubcontractorDiversityCategory } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { SubcontractorListItem } from "@/components/subcontractor-list-item";
import { apiFetch, downloadBlob, getToken, API_URL, ApiError } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface Subcontractor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  specialization: string | null;
  bio: string | null;
  publicListed: boolean;
  publicToken: string | null;
  licenseNumber: string | null;
  bondingCapacity: string | null;
  safetyProgramSummary: string | null;
  diversityCertifications: SubcontractorDiversityCategory[];
  diversityCertificationExpiresAt: string | null;
}
interface TaxSummaryRow {
  subcontractorId: string;
  name: string;
  legalBusinessName: string | null;
  taxIdMasked: string | null;
  mailingAddress: string | null;
  totalPaid: number;
  reportable: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();

export default function SubcontractorsPage() {
  const t = useTranslations("subcontractorCompliance");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const isUsCompany = me?.company.country === "US";

  const [subcontractors, setSubcontractors] = useState<Subcontractor[] | null>(null);
  const [newForm, setNewForm] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [taxSummaryYear, setTaxSummaryYear] = useState(String(CURRENT_YEAR));
  const [taxSummary, setTaxSummary] = useState<TaxSummaryRow[] | null>(null);
  const [datevError, setDatevError] = useState<string | null>(null);
  const [datevWarningCount, setDatevWarningCount] = useState<number | null>(null);

  async function exportDatevCsv() {
    setDatevError(null);
    setDatevWarningCount(null);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/finance/subcontractor-costs/export/datev.csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiError(res.status, body?.message ?? res.statusText);
      }
      const warningsCount = Number(res.headers.get("X-Datev-Warnings-Count") ?? "0");
      const blob = await res.blob();
      downloadBlob(blob, "subcontractor-costs-datev.csv");
      setDatevWarningCount(warningsCount);
    } catch (err) {
      setDatevError(err instanceof ApiError ? err.message : tc("error"));
    }
  }

  function load() {
    apiFetch<Subcontractor[]>("/finance/subcontractors").then(setSubcontractors);
  }

  useEffect(load, []);

  function loadTaxSummary(year: string) {
    apiFetch<TaxSummaryRow[]>(`/finance/subcontractors/tax-summary?year=${year}`).then(setTaxSummary);
  }

  useEffect(() => {
    if (isUsCompany) loadTaxSummary(taxSummaryYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUsCompany]);

  function onChanged() {
    load();
    if (isUsCompany) loadTaxSummary(taxSummaryYear);
  }

  async function createSubcontractor(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/finance/subcontractors", {
        method: "POST",
        body: JSON.stringify({ name: newForm.name, email: newForm.email || undefined, phone: newForm.phone || undefined }),
      });
      setNewForm({ name: "", email: "", phone: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthenticatedShell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <button onClick={exportDatevCsv} className="btn-secondary">
          {t("exportDatev")}
        </button>
      </div>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("complianceSubtitle")}</p>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t("datevTestImportNotice")}</p>
      {datevError && <p className="mt-1 text-xs text-error-600">{datevError}</p>}
      {datevWarningCount !== null && datevWarningCount > 0 && (
        <p className="mt-1 text-xs text-warning-700 dark:text-warning-500">{t("datevWarningCount", { count: datevWarningCount })}</p>
      )}

      <div className="mt-6 card max-w-md">
        <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("newSubcontractor")}</h2>
        <form onSubmit={createSubcontractor} className="flex flex-col gap-3">
          <input required placeholder={tc("name")} className="input" value={newForm.name} onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))} />
          <input type="email" placeholder={tc("email")} className="input" value={newForm.email} onChange={(e) => setNewForm((f) => ({ ...f, email: e.target.value }))} />
          <input placeholder={tc("phone")} className="input" value={newForm.phone} onChange={(e) => setNewForm((f) => ({ ...f, phone: e.target.value }))} />
          <button type="submit" disabled={busy} className="btn-primary self-start">
            {tc("create")}
          </button>
        </form>
      </div>

      <div className="mt-8">
        {!subcontractors ? (
          <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
        ) : subcontractors.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">{t("noSubcontractors")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {subcontractors.map((s) => (
              <SubcontractorListItem key={s.id} subcontractor={s} isUsCompany={!!isUsCompany} onChanged={onChanged} />
            ))}
          </ul>
        )}
      </div>

      {isUsCompany && (
        <div className="mt-8 card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("taxSummaryTitle")}</h2>
            <select
              className="input w-auto"
              value={taxSummaryYear}
              onChange={(e) => {
                setTaxSummaryYear(e.target.value);
                loadTaxSummary(e.target.value);
              }}
            >
              {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("taxSummaryHint")}</p>
          {taxSummary === null ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
          ) : taxSummary.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("noTaxSummary")}</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="py-1.5 font-medium">{tc("name")}</th>
                  <th className="font-medium">{t("legalBusinessNamePlaceholder")}</th>
                  <th className="font-medium">{t("taxIdPlaceholder")}</th>
                  <th className="text-right font-medium">{t("totalPaid")}</th>
                  <th className="text-right font-medium">{t("reportable")}</th>
                </tr>
              </thead>
              <tbody>
                {taxSummary.map((row) => (
                  <tr key={row.subcontractorId} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-1.5">{row.name}</td>
                    <td className="text-gray-500 dark:text-gray-400">{row.legalBusinessName ?? "—"}</td>
                    <td className="text-gray-500 dark:text-gray-400">{row.taxIdMasked ?? "—"}</td>
                    <td className="text-right font-medium">{row.totalPaid}</td>
                    <td className="text-right">
                      {row.reportable ? (
                        <span className="rounded-full bg-warning-50 dark:bg-warning-500/15 px-2 py-0.5 text-xs font-medium text-warning-700 dark:text-warning-500">{t("reportableYes")}</span>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">{t("reportableNo")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}
    </AuthenticatedShell>
  );
}
