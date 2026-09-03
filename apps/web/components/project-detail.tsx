"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { CommentsThread } from "@/components/comments-thread";
import { SchedulingPanel } from "@/components/scheduling-panel";
import { LookAheadPanel } from "@/components/look-ahead-panel";
import { DailyLogsPanel } from "@/components/daily-logs-panel";
import { CrewSmsBroadcastPanel } from "@/components/crew-sms-broadcast-panel";
import { SiteSignInsPanel } from "@/components/site-sign-ins-panel";
import { WeatherDelayReportPanel } from "@/components/weather-delay-report-panel";
import { WeatherForecastPanel } from "@/components/weather-forecast-panel";
import { GeofencePanel } from "@/components/geofence-panel";
import { CertifiedPayrollPanel } from "@/components/certified-payroll-panel";
import { PermitsPanel } from "@/components/permits-panel";
import { SuretyBondsPanel } from "@/components/surety-bonds-panel";
import { ContractClaimsPanel } from "@/components/contract-claims-panel";
import { ProjectMembersPanel } from "@/components/project-members-panel";
import { ContractsPanel } from "@/components/contracts-panel";
import { DrawRequestsPanel } from "@/components/draw-requests-panel";
import { TakeoffPanel } from "@/components/takeoff-panel";
import { DrawingSheetsPanel } from "@/components/drawing-sheets-panel";
import { GreenCertificationsPanel } from "@/components/green-certifications-panel";
import { PortalMessagesPanel } from "@/components/portal-messages-panel";
import { CarbonReportPanel } from "@/components/carbon-report-panel";
import { ProjectCashFlowPanel } from "@/components/project-cash-flow-panel";
import { CustomFieldsValuesPanel } from "@/components/custom-fields-values-panel";
import { PunchListPanel } from "@/components/punch-list-panel";
import { RfiPanel } from "@/components/rfi-panel";
import { SafetyPanel } from "@/components/safety-panel";
import { QualityPanel } from "@/components/quality-panel";
import { SubmittalsPanel } from "@/components/submittals-panel";
import { WarrantyPanel } from "@/components/warranty-panel";
import { ProjectCloseoutPanel } from "@/components/project-closeout-panel";
import { BudgetPanel } from "@/components/budget-panel";
import { JobCostingPanel } from "@/components/job-costing-panel";
import { TimeTrackingPanel } from "@/components/time-tracking-panel";
import { SubcontractorCostsPanel } from "@/components/subcontractor-costs-panel";
import { SubcontractorAssignmentsPanel } from "@/components/subcontractor-assignments-panel";
import { BidRequestsPanel } from "@/components/bid-requests-panel";
import { DocumentsPanel } from "@/components/documents-panel";
import { GalleryPanel } from "@/components/gallery-panel";
import { ProjectHealthBadge } from "@/components/project-health-badge";
import { SUPPORTED_CURRENCIES } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface Project {
  id: string;
  name: string;
  address: string | null;
  client: { id: string; name: string } | null;
  currency: string | null;
  budgetAlertThresholdPercent: number | null;
  contingencyAmount: string | null;
}
interface Estimate {
  id: string;
  name: string;
  status: string;
  grandTotal: string;
  project: { id: string };
}
interface Template {
  id: string;
  name: string;
}

export function ProjectDetail({ projectId }: { projectId: string }) {
  const t = useTranslations("estimates");
  const tp = useTranslations("projects");
  const tc = useTranslations("common");
  const router = useRouter();
  const { data: me } = useMe();

  const [project, setProject] = useState<Project | null>(null);
  const [estimates, setEstimates] = useState<Estimate[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState({
    name: "",
    laborRatePerHour: "35",
    markupPercent: "15",
    taxPercent: "0",
    templateId: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [currencyBusy, setCurrencyBusy] = useState(false);
  const [budgetThresholdBusy, setBudgetThresholdBusy] = useState(false);
  const [budgetThresholdDraft, setBudgetThresholdDraft] = useState("");
  const [contingencyBusy, setContingencyBusy] = useState(false);
  const [contingencyDraft, setContingencyDraft] = useState("");

  useEffect(() => {
    apiFetch<Project>(`/projects/${projectId}`).then((p) => {
      setProject(p);
      setBudgetThresholdDraft(p.budgetAlertThresholdPercent !== null ? String(p.budgetAlertThresholdPercent) : "");
      setContingencyDraft(p.contingencyAmount !== null ? p.contingencyAmount : "");
    });
    apiFetch<Estimate[]>("/estimates").then((all) => setEstimates(all.filter((e) => e.project.id === projectId)));
    apiFetch<Template[]>("/estimates/templates").then(setTemplates);
  }, [projectId]);

  async function saveCurrency(value: string) {
    setCurrencyBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/currency`, {
        method: "PATCH",
        body: JSON.stringify({ currency: value || null }),
      });
      setProject((p) => (p ? { ...p, currency: value || null } : p));
    } finally {
      setCurrencyBusy(false);
    }
  }

  async function saveBudgetThreshold() {
    setBudgetThresholdBusy(true);
    try {
      const value = budgetThresholdDraft ? Number(budgetThresholdDraft) : null;
      await apiFetch(`/projects/${projectId}/budget-alert-threshold`, {
        method: "PATCH",
        body: JSON.stringify({ budgetAlertThresholdPercent: value }),
      });
      setProject((p) => (p ? { ...p, budgetAlertThresholdPercent: value } : p));
    } finally {
      setBudgetThresholdBusy(false);
    }
  }

  async function saveContingency() {
    setContingencyBusy(true);
    try {
      const value = contingencyDraft ? Number(contingencyDraft) : null;
      await apiFetch(`/projects/${projectId}/contingency`, {
        method: "PATCH",
        body: JSON.stringify({ contingencyAmount: value }),
      });
      setProject((p) => (p ? { ...p, contingencyAmount: value !== null ? String(value) : null } : p));
    } finally {
      setContingencyBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = JSON.stringify({
        projectId,
        name: form.name,
        laborRatePerHour: Number(form.laborRatePerHour),
        markupPercent: Number(form.markupPercent),
        taxPercent: Number(form.taxPercent),
      });
      const estimate = await apiFetch<{ id: string }>(
        form.templateId ? `/estimates/from-template/${form.templateId}` : "/estimates",
        { method: "POST", body },
      );
      router.push(`/estimates/${estimate.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthenticatedShell>
      <a href="/projects" className="text-sm text-gray-500 hover:underline">
        ← {tc("back")}
      </a>
      <div className="mt-2 flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{project?.name ?? tc("loading")}</h1>
        {project && <ProjectHealthBadge projectId={projectId} />}
      </div>
      {project?.client && <p className="text-sm text-gray-500">{project.client.name}</p>}
      {project && (
        <label className="mt-2 flex w-fit items-center gap-2 text-xs text-gray-500">
          {tp("billingCurrency")}
          <select
            className="input w-auto py-1"
            value={project.currency ?? ""}
            disabled={currencyBusy}
            onChange={(e) => saveCurrency(e.target.value)}
          >
            <option value="">{tp("billingCurrencyDefault", { currency: me?.company.currency ?? "" })}</option>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      )}
      {project && (
        <label className="mt-2 flex w-fit items-center gap-2 text-xs text-gray-500">
          {tp("budgetAlertThreshold")}
          <input
            type="number"
            min="1"
            max="100"
            className="input w-20 py-1"
            placeholder={String(me?.company.budgetAlertThresholdPercent ?? 90)}
            value={budgetThresholdDraft}
            disabled={budgetThresholdBusy}
            onChange={(e) => setBudgetThresholdDraft(e.target.value)}
            onBlur={saveBudgetThreshold}
          />
          %
        </label>
      )}
      {project && (
        <label className="mt-2 flex w-fit items-center gap-2 text-xs text-gray-500">
          {tp("contingencyAmount")}
          <input
            type="number"
            min="0"
            step="0.01"
            className="input w-28 py-1"
            placeholder={tp("contingencyAmountPlaceholder")}
            value={contingencyDraft}
            disabled={contingencyBusy}
            onChange={(e) => setContingencyDraft(e.target.value)}
            onBlur={saveContingency}
          />
          {project.currency ?? me?.company.currency}
        </label>
      )}

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">{tp("projectChannel")}</h2>
        <div className="card">
          <CommentsThread param="projectId" entityId={projectId} />
        </div>
      </div>

      <PortalMessagesPanel projectId={projectId} />

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">{t("newEstimate")}</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {templates.length > 0 && (
              <label className="text-xs text-gray-500">
                {t("startFromTemplate")}
                <select
                  className="input mt-1"
                  value={form.templateId}
                  onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}
                >
                  <option value="">{t("blankEstimate")}</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <input
              required
              placeholder={tc("name")}
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <label className="text-xs text-gray-500">
              {t("laborRate")} ({me?.company.currency})
              <input
                required
                type="number"
                step="0.01"
                className="input mt-1"
                value={form.laborRatePerHour}
                onChange={(e) => setForm((f) => ({ ...f, laborRatePerHour: e.target.value }))}
              />
            </label>
            <label className="text-xs text-gray-500">
              {t("markup")}
              <input
                required
                type="number"
                step="0.1"
                className="input mt-1"
                value={form.markupPercent}
                onChange={(e) => setForm((f) => ({ ...f, markupPercent: e.target.value }))}
              />
            </label>
            <label className="text-xs text-gray-500">
              {t("tax")}
              <input
                required
                type="number"
                step="0.1"
                className="input mt-1"
                value={form.taxPercent}
                onChange={(e) => setForm((f) => ({ ...f, taxPercent: e.target.value }))}
              />
            </label>
            <button type="submit" disabled={submitting} className="btn-primary">
              {tc("create")}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{tp("viewEstimates")}</h2>
          {!estimates ? (
            <p className="text-gray-500">{tc("loading")}</p>
          ) : estimates.length === 0 ? (
            <p className="text-gray-500">—</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {estimates.map((e) => (
                <li key={e.id}>
                  <a href={`/estimates/${e.id}`} className="card flex items-center justify-between hover:border-gray-400">
                    <span className="font-medium">{e.name}</span>
                    <span className="text-sm text-gray-500">
                      {e.status === "approved" ? t("approved") : t("draft")} · {e.grandTotal} {me?.company.currency}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <TakeoffPanel projectId={projectId} />
      <DrawingSheetsPanel projectId={projectId} />
      <SchedulingPanel projectId={projectId} />
      <LookAheadPanel projectId={projectId} />
      <ContractsPanel projectId={projectId} />
      <WeatherForecastPanel projectId={projectId} />
      <GeofencePanel projectId={projectId} />
      <CertifiedPayrollPanel projectId={projectId} />
      <PermitsPanel projectId={projectId} />
      <SuretyBondsPanel projectId={projectId} />
      <ContractClaimsPanel projectId={projectId} />
      <ProjectMembersPanel projectId={projectId} />
      <CustomFieldsValuesPanel entityType="project" entityId={projectId} />
      <DailyLogsPanel projectId={projectId} />
      <CrewSmsBroadcastPanel projectId={projectId} />
      <WeatherDelayReportPanel projectId={projectId} />
      <PunchListPanel projectId={projectId} />
      <RfiPanel projectId={projectId} />
      <SiteSignInsPanel projectId={projectId} />
      <SafetyPanel projectId={projectId} />
      <QualityPanel projectId={projectId} />
      <SubmittalsPanel projectId={projectId} />
      <WarrantyPanel projectId={projectId} />
      <TimeTrackingPanel projectId={projectId} />
      <BidRequestsPanel projectId={projectId} />
      <SubcontractorAssignmentsPanel projectId={projectId} />
      <SubcontractorCostsPanel projectId={projectId} />
      <BudgetPanel projectId={projectId} />
      <JobCostingPanel projectId={projectId} />
      <DrawRequestsPanel projectId={projectId} />
      <ProjectCashFlowPanel projectId={projectId} />
      <GreenCertificationsPanel projectId={projectId} />
      <CarbonReportPanel projectId={projectId} />
      <DocumentsPanel projectId={projectId} />
      <GalleryPanel projectId={projectId} />
      <ProjectCloseoutPanel projectId={projectId} />
    </AuthenticatedShell>
  );
}
