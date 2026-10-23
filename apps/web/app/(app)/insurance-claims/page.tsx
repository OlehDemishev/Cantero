"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { INSURANCE_CLAIM_TYPES, INSURANCE_CLAIM_STATUSES, type InsuranceClaimType, type InsuranceClaimStatus } from "@cantero/shared";
import { DocumentsPanel } from "@/components/documents-panel";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/lib/use-me";
import { formatDate } from "@/lib/format-date";
import { resetStateInEffect } from "@/lib/effect-reset";
import { formatCurrency } from "@/lib/format-currency";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/status-tone";

interface Claim {
  id: string;
  projectId: string | null;
  incidentReportId: string | null;
  claimType: InsuranceClaimType;
  status: InsuranceClaimStatus;
  claimNumber: string | null;
  insurerName: string;
  policyNumber: string | null;
  dateFiled: string;
  description: string;
  adjusterName: string | null;
  adjusterContact: string | null;
  claimAmount: string | null;
  settledAmount: string | null;
  settledAt: string | null;
  notes: string | null;
  createdByName: string;
  project: { id: string; name: string } | null;
}
interface Project {
  id: string;
  name: string;
}

const emptyForm = {
  claimType: "general_liability" as InsuranceClaimType,
  projectId: "",
  incidentReportId: "",
  insurerName: "",
  policyNumber: "",
  claimNumber: "",
  dateFiled: new Date().toISOString().slice(0, 10),
  description: "",
  adjusterName: "",
  adjusterContact: "",
  claimAmount: "",
};

export default function InsuranceClaimsPage() {
  const t = useTranslations("insuranceClaims");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";
  const searchParams = useSearchParams();

  const { data: projects = [] } = useApi<Project[]>("/projects");
  const [filters, setFilters] = useState({ projectId: "", status: "" });
  const claimParams = new URLSearchParams();
  if (filters.projectId) claimParams.set("projectId", filters.projectId);
  const {
    data: allClaims,
    error: claimsError,
    reload: reloadClaims,
  } = useApi<Claim[]>(`/insurance-claims?${claimParams.toString()}`, { keepPrevious: true });
  const claims = allClaims ? (filters.status ? allClaims.filter((c) => c.status === filters.status) : allClaims) : null;
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [settleForm, setSettleForm] = useState({ settledAmount: "", settledAt: "" });

  function load() {
    void reloadClaims();
  }

  useEffect(() => {
    const projectId = searchParams.get("projectId");
    const incidentReportId = searchParams.get("incidentReportId");
    if (projectId || incidentReportId) {
      resetStateInEffect(() => {
        setForm((f) => ({ ...f, projectId: projectId ?? f.projectId, incidentReportId: incidentReportId ?? f.incidentReportId, claimType: "workers_comp" }));
        setCreating(true);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitClaim(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/insurance-claims", {
        method: "POST",
        body: JSON.stringify({
          claimType: form.claimType,
          projectId: form.projectId || undefined,
          incidentReportId: form.incidentReportId || undefined,
          insurerName: form.insurerName,
          policyNumber: form.policyNumber || undefined,
          claimNumber: form.claimNumber || undefined,
          dateFiled: new Date(form.dateFiled).toISOString(),
          description: form.description,
          adjusterName: form.adjusterName || undefined,
          adjusterContact: form.adjusterContact || undefined,
          claimAmount: form.claimAmount ? Number(form.claimAmount) : undefined,
        }),
      });
      setForm(emptyForm);
      setCreating(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(claim: Claim, status: InsuranceClaimStatus) {
    setBusy(true);
    try {
      await apiFetch(`/insurance-claims/${claim.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      load();
    } finally {
      setBusy(false);
    }
  }

  function startSettle(claim: Claim) {
    setExpandedId(claim.id);
    setSettleForm({ settledAmount: claim.settledAmount ?? "", settledAt: claim.settledAt ? claim.settledAt.slice(0, 10) : "" });
  }

  async function submitSettle(claim: Claim, e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/insurance-claims/${claim.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "settled",
          settledAmount: settleForm.settledAmount ? Number(settleForm.settledAmount) : null,
          settledAt: settleForm.settledAt ? new Date(settleForm.settledAt).toISOString() : null,
        }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    const blob = await apiFetch<Blob>("/insurance-claims/export");
    downloadBlob(blob, "insurance-claims.csv");
  }

  const openTotal = (claims ?? [])
    .filter((c) => c.status !== "closed" && c.status !== "denied" && c.status !== "settled")
    .reduce((sum, c) => sum + Number(c.claimAmount ?? 0), 0);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-fg-subtle">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="btn-secondary">
            {t("exportCsv")}
          </button>
          <button onClick={() => setCreating((v) => !v)} className="btn-primary">
            {t("newClaim")}
          </button>
        </div>
      </div>

      {claims && claims.length > 0 && (
        <p className="mt-2 text-sm font-medium text-fg-muted">{t("openTotal", { amount: formatCurrency(openTotal, currency) })}</p>
      )}

      {creating && (
        <form onSubmit={submitClaim} className="card mt-4 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <select
              className="input w-auto"
              value={form.claimType}
              onChange={(e) => setForm((f) => ({ ...f, claimType: e.target.value as InsuranceClaimType }))}
            >
              {INSURANCE_CLAIM_TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {t(`type_${ty}`)}
                </option>
              ))}
            </select>
            <select className="input w-auto" value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
              <option value="">{t("noProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              required
              className="input w-auto"
              value={form.dateFiled}
              onChange={(e) => setForm((f) => ({ ...f, dateFiled: e.target.value }))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              required
              className="input flex-1"
              placeholder={t("insurerName")}
              value={form.insurerName}
              onChange={(e) => setForm((f) => ({ ...f, insurerName: e.target.value }))}
            />
            <input
              className="input w-40"
              placeholder={t("policyNumber")}
              value={form.policyNumber}
              onChange={(e) => setForm((f) => ({ ...f, policyNumber: e.target.value }))}
            />
            <input
              className="input w-40"
              placeholder={t("claimNumber")}
              value={form.claimNumber}
              onChange={(e) => setForm((f) => ({ ...f, claimNumber: e.target.value }))}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              className="input w-32"
              placeholder={t("claimAmount")}
              value={form.claimAmount}
              onChange={(e) => setForm((f) => ({ ...f, claimAmount: e.target.value }))}
            />
          </div>
          <textarea
            required
            rows={2}
            className="input"
            placeholder={t("description")}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={t("adjusterName")}
              value={form.adjusterName}
              onChange={(e) => setForm((f) => ({ ...f, adjusterName: e.target.value }))}
            />
            <input
              className="input flex-1"
              placeholder={t("adjusterContact")}
              value={form.adjusterContact}
              onChange={(e) => setForm((f) => ({ ...f, adjusterContact: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary self-start">
              {t("fileClaim")}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="btn-secondary self-start">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          className="input w-auto"
          value={filters.projectId}
          onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))}
        >
          <option value="">{t("allProjects")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">{t("allStatuses")}</option>
          {INSURANCE_CLAIM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status_${s}`)}
            </option>
          ))}
        </select>
      </div>

      {!claims ? (
        claimsError ? <ErrorState error={claimsError} onRetry={reloadClaims} compact className="mt-4" /> : <Skeleton className="mt-4" lines={3} />
      ) : claims.length === 0 ? (
        <p className="mt-4 text-sm text-fg-subtle">{t("empty")}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {claims.map((claim) => (
            <li key={claim.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-fg">{claim.insurerName}</span>
                  <Badge tone="neutral" className="ml-2">{t(`type_${claim.claimType}`)}</Badge>
                  <Badge tone={statusTone(claim.status, "insuranceClaim")} className="ml-2">
                    {t(`status_${claim.status}`)}
                  </Badge>
                </div>
                <button
                  onClick={() => setExpandedId(expandedId === claim.id ? null : claim.id)}
                  className="text-xs text-brand-700 dark:text-brand-400 hover:underline"
                >
                  {expandedId === claim.id ? tc("close") : t("details")}
                </button>
              </div>
              <p className="mt-1 text-xs text-fg-subtle">
                {claim.project ? (
                  <Link href={`/projects/${claim.project.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                    {claim.project.name}
                  </Link>
                ) : (
                  t("noProject")
                )}{" "}
                · {formatDate(new Date(claim.dateFiled))}
                {claim.claimAmount && ` · ${formatCurrency(claim.claimAmount, currency)}`}
              </p>
              <p className="mt-1 text-sm text-fg-muted">{claim.description}</p>

              {expandedId === claim.id && (
                <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                  <dl className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300 sm:grid-cols-4">
                    {claim.claimNumber && <Row label={t("claimNumber")} value={claim.claimNumber} />}
                    {claim.policyNumber && <Row label={t("policyNumber")} value={claim.policyNumber} />}
                    {claim.adjusterName && <Row label={t("adjusterName")} value={claim.adjusterName} />}
                    {claim.adjusterContact && <Row label={t("adjusterContact")} value={claim.adjusterContact} />}
                    {claim.settledAmount && <Row label={t("settledAmount")} value={`${formatCurrency(claim.settledAmount, currency)}`} />}
                    {claim.settledAt && <Row label={t("settledAt")} value={formatDate(new Date(claim.settledAt))} />}
                  </dl>

                  <div className="mt-3 flex flex-wrap gap-1">
                    {INSURANCE_CLAIM_STATUSES.filter((s) => s !== claim.status && s !== "settled").map((s) => (
                      <button key={s} onClick={() => setStatus(claim, s)} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                        → {t(`status_${s}`)}
                      </button>
                    ))}
                    {claim.status !== "settled" && claim.status !== "closed" && claim.status !== "denied" && (
                      <button onClick={() => startSettle(claim)} className="btn-secondary px-2 py-1 text-xs">
                        → {t("recordSettlement")}
                      </button>
                    )}
                  </div>

                  {claim.status !== "settled" && claim.status !== "closed" && claim.status !== "denied" && (
                    <form onSubmit={(e) => submitSettle(claim, e)} className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1 text-xs text-fg-subtle">
                        {t("settledAmount")}
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="input w-32"
                          value={settleForm.settledAmount}
                          onChange={(e) => setSettleForm((f) => ({ ...f, settledAmount: e.target.value }))}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-fg-subtle">
                        {t("settledAt")}
                        <input
                          type="date"
                          className="input"
                          value={settleForm.settledAt}
                          onChange={(e) => setSettleForm((f) => ({ ...f, settledAt: e.target.value }))}
                        />
                      </label>
                      <button type="submit" disabled={busy} className="btn-primary">
                        {t("recordSettlement")}
                      </button>
                    </form>
                  )}

                  <div className="mt-4">
                    <DocumentsPanel insuranceClaimId={claim.id} />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="font-medium text-fg-muted">{value}</dd>
    </div>
  );
}
