"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ApprenticeRatioViolation, CertifiedPayrollLine } from "@cantero/shared";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatCurrency, formatNumber } from "@/lib/format-currency";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Field, FormError } from "@/components/ui/field";

interface Project {
  isPublicWork: boolean;
  contractNumber: string | null;
}

interface CertifiedPayrollReport {
  id: string;
  weekEndingDate: string;
  payrollNumber: number;
  noWorkPerformed: boolean;
  totalGrossPay: string | null;
  statementSignerName: string | null;
  statementSignedAt: string | null;
}

interface PreviewResult {
  lines: CertifiedPayrollLine[];
  totalGrossPay: number;
  apprenticeRatioViolations: ApprenticeRatioViolation[];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function CertifiedPayrollPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("certifiedPayroll");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [project, setProject] = useState<Project | null>(null);
  const [projectError, setProjectError] = useState<Error | null>(null);
  const [publicWorkForm, setPublicWorkForm] = useState({ isPublicWork: false, contractNumber: "" });
  const [reports, setReports] = useState<CertifiedPayrollReport[] | null>(null);
  const [reportsError, setReportsError] = useState<Error | null>(null);
  const [weekEndingDate, setWeekEndingDate] = useState(todayIso());
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signingId, setSigningId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadProject() {
    apiFetch<Project>(`/projects/${projectId}`).then((p) => {
      setProjectError(null);
      setProject(p);
      setPublicWorkForm({ isPublicWork: p.isPublicWork, contractNumber: p.contractNumber ?? "" });
    }).catch(setProjectError);
  }

  function loadReports() {
    apiFetch<CertifiedPayrollReport[]>(`/projects/${projectId}/certified-payroll`)
      .then((result) => {
        setReportsError(null);
        setReports(result);
      })
      .catch(setReportsError);
  }

  useEffect(loadProject, [projectId]);
  useEffect(() => {
    if (project?.isPublicWork) loadReports();
  }, [projectId, project?.isPublicWork]);

  async function savePublicWork(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/projects/${projectId}/public-work`, {
        method: "PATCH",
        body: JSON.stringify({ isPublicWork: publicWorkForm.isPublicWork, contractNumber: publicWorkForm.contractNumber || null }),
      });
      loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function loadPreview() {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const result = await apiFetch<PreviewResult>(
        `/projects/${projectId}/certified-payroll/preview?weekEndingDate=${weekEndingDate}`,
      );
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/projects/${projectId}/certified-payroll/generate`, {
        method: "POST",
        body: JSON.stringify({ weekEndingDate }),
      });
      setPreview(null);
      loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function markNoWork() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/projects/${projectId}/certified-payroll/no-work`, {
        method: "POST",
        body: JSON.stringify({ weekEndingDate }),
      });
      loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function sign(reportId: string) {
    if (!signerName.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/certified-payroll/${reportId}/sign`, {
        method: "POST",
        body: JSON.stringify({ signerName }),
      });
      setSigningId(null);
      setSignerName("");
      loadReports();
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf(reportId: string) {
    const blob = await apiFetch<Blob>(`/certified-payroll/${reportId}/pdf`);
    downloadBlob(blob, `certified-payroll-${reportId}.pdf`);
  }

  if (!project) return projectError ? <ErrorState error={projectError} onRetry={loadProject} compact /> : <Skeleton lines={3} />;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("hint")}</p>

      <form onSubmit={savePublicWork} className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={publicWorkForm.isPublicWork}
            onChange={(e) => setPublicWorkForm((f) => ({ ...f, isPublicWork: e.target.checked }))}
          />
          {t("isPublicWork")}
        </label>
        {publicWorkForm.isPublicWork && (
          <Field label={t("contractNumber")} size="sm">
            <input
              className="input w-48"
              value={publicWorkForm.contractNumber}
              onChange={(e) => setPublicWorkForm((f) => ({ ...f, contractNumber: e.target.value }))}
            />
          </Field>
        )}
        <button type="submit" disabled={busy} className="btn-secondary">
          {tc("save")}
        </button>
      </form>

      {error && <FormError className="mb-2">{error}</FormError>}

      {project.isPublicWork && (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
            <Field label={t("weekEndingDate")} size="sm">
              <input type="date" className="input w-40" value={weekEndingDate} onChange={(e) => setWeekEndingDate(e.target.value)} />
            </Field>
            <button type="button" onClick={loadPreview} disabled={busy} className="btn-secondary">
              {t("preview")}
            </button>
            <button type="button" onClick={generate} disabled={busy} className="btn-primary">
              {t("generate")}
            </button>
            <button type="button" onClick={markNoWork} disabled={busy} className="btn-secondary">
              {t("noWorkPerformed")}
            </button>
          </div>

          {preview && (
            <div className="mb-4 overflow-x-auto">
              {preview.apprenticeRatioViolations.filter((v) => !v.compliant).length > 0 && (
                <ul className="mb-3 flex flex-col gap-1">
                  {preview.apprenticeRatioViolations
                    .filter((v) => !v.compliant)
                    .map((v) => (
                      <li key={v.trade} className="rounded-md bg-error-50 dark:bg-error-500/15 px-2.5 py-1.5 text-xs text-danger-fg">
                        {t("apprenticeRatioViolation", { trade: v.trade, apprenticeCount: v.apprenticeCount, maxAllowed: v.maxAllowedApprentices, ratio: v.ratio })}
                      </li>
                    ))}
                </ul>
              )}
              {preview.lines.length === 0 ? (
                <p className="text-sm text-fg-subtle">{t("noHoursThisWeek")}</p>
              ) : (
                <table className="min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-fg-subtle">
                      <th className="pb-1 pr-3">{t("employee")}</th>
                      <th className="pb-1 pr-3">{t("classification")}</th>
                      <th className="pb-1 pr-3">{t("regularHours")}</th>
                      <th className="pb-1 pr-3">{t("overtimeHours")}</th>
                      <th className="pb-1 pr-3">{t("rate")}</th>
                      <th className="pb-1 pr-3">{t("fringe")}</th>
                      <th className="pb-1 pr-3">{t("grossPay")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.map((line) => (
                      <tr key={line.workerId} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="py-1 pr-3">{line.workerName}</td>
                        <td className="py-1 pr-3 text-fg-subtle">
                          {line.trade ?? t("unclassified")}
                          {line.isApprentice && <Badge tone="brand" size="sm" className="ml-1">{t("apprentice")}</Badge>}
                        </td>
                        <td className="py-1 pr-3">{formatNumber(line.regularHours, { fractionDigits: 2 })}</td>
                        <td className="py-1 pr-3">{formatNumber(line.overtimeHours, { fractionDigits: 2 })}</td>
                        <td className="py-1 pr-3">{line.ratePerHour !== null ? formatCurrency(line.ratePerHour, currency) : "—"}</td>
                        <td className="py-1 pr-3 text-fg-subtle">
                          {formatCurrency(line.fringeRate, currency)}
                          {line.fringeBreakdown.length > 0 && (
                            <span className="ml-1 text-xs text-fg-subtle" title={line.fringeBreakdown.map((f) => `${f.name}: ${formatCurrency(f.amount, currency)}`).join(", ")}>
                              ({line.fringeBreakdown.length})
                            </span>
                          )}
                        </td>
                        <td className="py-1 pr-3">
                          {line.grossPay !== null ? formatCurrency(line.grossPay, currency) : "—"}
                          {line.belowPrevailingRate && <span className="ml-1 text-danger-fg" title={t("belowPrevailingRate")}>⚠</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="mt-2 text-sm font-medium text-fg-muted">
                {t("totalGrossPay")}: {formatCurrency(preview.totalGrossPay, currency)}
              </p>
            </div>
          )}

          {!reports ? (
            reportsError ? <ErrorState error={reportsError} onRetry={loadReports} compact /> : <Skeleton lines={3} />
          ) : reports.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t("noReports")}</p>
          ) : (
            <ul className="flex flex-col gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
              {reports.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-fg-muted">
                    #{r.payrollNumber} — {r.weekEndingDate.slice(0, 10)}
                    {r.noWorkPerformed ? ` (${t("noWorkPerformed")})` : ` — ${formatCurrency(r.totalGrossPay ?? 0, currency)}`}
                  </span>
                  <span className="flex items-center gap-2">
                    {r.statementSignedAt ? (
                      <span className="text-xs text-success-fg">{t("signedBy", { name: r.statementSignerName ?? "" })}</span>
                    ) : signingId === r.id ? (
                      <>
                        <input
                          className="input w-40 py-1 text-xs"
                          placeholder={t("signerNamePlaceholder")} aria-label={t("signerNamePlaceholder")}
                          value={signerName}
                          onChange={(e) => setSignerName(e.target.value)}
                        />
                        <button onClick={() => sign(r.id)} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                          {t("confirmSign")}
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setSigningId(r.id)} className="btn-secondary px-2 py-1 text-xs">
                        {t("sign")}
                      </button>
                    )}
                    <button onClick={() => downloadPdf(r.id)} className="btn-secondary px-2 py-1 text-xs">
                      {t("downloadPdf")}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
