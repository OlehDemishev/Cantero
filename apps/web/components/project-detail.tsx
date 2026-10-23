"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { TabNav, TabPanel, type TabNavItem } from "@/components/ui/tab-nav";
import { goBack } from "@/lib/back-navigation";
import { useApi } from "@/lib/use-api";
import { resetStateInEffect } from "@/lib/effect-reset";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { CommentsThread } from "@/components/comments-thread";
import { ProjectMembersPanel } from "@/components/project-members-panel";
import { PortalMessagesPanel } from "@/components/portal-messages-panel";
import { CustomFieldsValuesPanel } from "@/components/custom-fields-values-panel";
import { ClientChangeRequestsPanel } from "@/components/client-change-requests-panel";
import { ProjectHealthBadge } from "@/components/project-health-badge";
import { SUPPORTED_CURRENCIES, createEstimateSchema } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { useCan } from "@/lib/permissions";
import type { Permission } from "@cantero/shared";
import { formatCurrency } from "@/lib/format-currency";
import { PageHeader } from "@/components/ui/page-header";
import { Field, FormError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { optionalNumber, useFormValidation } from "@/lib/form-validation";

// Only one tab shows at a time, so every tab but the default one is its own chunk, fetched when the
// tab is first opened (the financials tab alone carries recharts). Each stands in with a skeleton.
function TabLoading() {
  return <Skeleton lines={4} className="mt-6" />;
}
const ScheduleTab = dynamic(() => import("@/components/project-tabs/schedule-tab").then((m) => m.ScheduleTab), { loading: TabLoading });
const FinancialsTab = dynamic(() => import("@/components/project-tabs/financials-tab").then((m) => m.FinancialsTab), { loading: TabLoading });
const FieldTab = dynamic(() => import("@/components/project-tabs/field-tab").then((m) => m.FieldTab), { loading: TabLoading });
const QualityTab = dynamic(() => import("@/components/project-tabs/quality-tab").then((m) => m.QualityTab), { loading: TabLoading });
const ComplianceTab = dynamic(() => import("@/components/project-tabs/compliance-tab").then((m) => m.ComplianceTab), { loading: TabLoading });
const SubcontractorsTab = dynamic(() => import("@/components/project-tabs/subcontractors-tab").then((m) => m.SubcontractorsTab), {
  loading: TabLoading,
});
const DocumentsTab = dynamic(() => import("@/components/project-tabs/documents-tab").then((m) => m.DocumentsTab), { loading: TabLoading });

interface Project {
  id: string;
  name: string;
  address: string | null;
  client: { id: string; name: string } | null;
  currency: string | null;
  budgetAlertThresholdPercent: number | null;
  contingencyAmount: string | null;
  autodeskProjectId: string | null;
  autodeskModelUrn: string | null;
  autodeskModelName: string | null;
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

const PROJECT_TAB_KEYS = [
  "overview",
  "schedule",
  "financials",
  "field",
  "quality",
  "compliance",
  "subcontractors",
  "documents",
] as const;
type ProjectTabKey = (typeof PROJECT_TAB_KEYS)[number];

/** Which tab a deep-linked sub-entity (RFI, punch-list item, etc.) belongs to — see useDeepLinkedRow. */
export const ITEM_TYPE_TO_TAB: Record<string, ProjectTabKey> = {
  rfi: "quality",
  punch_list: "quality",
  meeting: "quality",
  submittal: "quality",
};

const NO_TEMPLATES: Template[] = [];

export function ProjectDetail({ projectId }: { projectId: string }) {
  const t = useTranslations("estimates");
  const tp = useTranslations("projects");
  const tc = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: me } = useMe();
  const can = useCan();
  const canEstimates = can("estimates.view");

  const [project, setProject] = useState<Project | null>(null);
  const [projectError, setProjectError] = useState<Error | null>(null);
  const [projectAttempt, setProjectAttempt] = useState(0);
  // Estimates carry prices: only fetched, and only shown, for someone who may see them.
  const { data: allEstimates, error: estimatesError, reload: reloadEstimates } = useApi<Estimate[]>(canEstimates ? "/estimates" : null);
  const estimates = useMemo(() => allEstimates?.filter((e) => e.project.id === projectId) ?? null, [allEstimates, projectId]);
  const { data: templates = NO_TEMPLATES } = useApi<Template[]>(canEstimates ? "/estimates/templates" : null);
  const [form, setForm] = useState({
    name: "",
    laborRatePerHour: "35",
    markupPercent: "15",
    taxPercent: "0",
    templateId: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { errors, validate, clearError, formRef } = useFormValidation(createEstimateSchema);
  const [currencyBusy, setCurrencyBusy] = useState(false);
  const [budgetThresholdBusy, setBudgetThresholdBusy] = useState(false);
  const [budgetThresholdDraft, setBudgetThresholdDraft] = useState("");
  const [contingencyBusy, setContingencyBusy] = useState(false);
  const [contingencyDraft, setContingencyDraft] = useState("");

  const tabFromParam = searchParams.get("tab");
  const itemType = searchParams.get("itemType");
  const validTabFromParam =
    tabFromParam && (PROJECT_TAB_KEYS as readonly string[]).includes(tabFromParam) ? (tabFromParam as ProjectTabKey) : undefined;
  const tabFromItemType = itemType ? ITEM_TYPE_TO_TAB[itemType] : undefined;
  const activeTab: ProjectTabKey = validTabFromParam ?? tabFromItemType ?? "overview";

  function setTab(key: string) {
    router.replace(`/projects/${projectId}?tab=${key}`, { scroll: false });
  }

  // A tab whose every panel needs a permission this member lacks isn't offered at all.
  const TAB_NEEDS: Partial<Record<ProjectTabKey, Permission[]>> = {
    financials: ["finance.view", "costing.view", "estimates.view", "contracts.view"],
    compliance: ["site.manage", "finance.view", "contracts.view", "hr.payroll"],
    subcontractors: ["estimates.view", "subcontractors.view", "finance.view"],
  };
  const TABS: TabNavItem[] = PROJECT_TAB_KEYS.filter((key) => !TAB_NEEDS[key] || TAB_NEEDS[key]!.some((p) => can(p))).map((key) => ({
    key,
    label: tp(`tab_${key}`),
  }));

  useEffect(() => {
    // Another project: never show the previous one's name and settings while this one loads.
    let current = true;
    resetStateInEffect(() => {
      setProject(null);
      setProjectError(null);
    });
    apiFetch<Project>(`/projects/${projectId}`)
      .then((p) => {
        if (!current) return;
        setProject(p);
        setBudgetThresholdDraft(p.budgetAlertThresholdPercent !== null ? String(p.budgetAlertThresholdPercent) : "");
        setContingencyDraft(p.contingencyAmount !== null ? p.contingencyAmount : "");
      })
      .catch((err: Error) => {
        if (current) setProjectError(err);
      });
    return () => {
      current = false;
    };
  }, [projectId, projectAttempt]);

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

  function updateEstimateField(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    clearError(field);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input = validate({
      projectId,
      name: form.name.trim(),
      laborRatePerHour: optionalNumber(form.laborRatePerHour),
      markupPercent: optionalNumber(form.markupPercent),
      taxPercent: optionalNumber(form.taxPercent),
    });
    if (!input) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const estimate = await apiFetch<{ id: string }>(
        form.templateId ? `/estimates/from-template/${form.templateId}` : "/estimates",
        { method: "POST", body: JSON.stringify(input) },
      );
      router.push(`/estimates/${estimate.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setSubmitting(false);
    }
  }

  if (projectError) return <ErrorState error={projectError} onRetry={() => setProjectAttempt((n) => n + 1)} backHref="/projects" />;

  return (
    <>
      <PageHeader
        back={{ onClick: () => goBack(router, "/projects"), label: tc("back") }}
        title={project?.name ?? tc("loading")}
        actions={project && <ProjectHealthBadge projectId={projectId} />}
      />
      {project?.client && (
        <Link href={`/clients/${project.client.id}`} className="text-sm text-brand-700 dark:text-brand-400 hover:underline">
          {project.client.name}
        </Link>
      )}

      <TabNav id="project-tabs" tabs={TABS} active={activeTab} onChange={setTab} />
      <TabPanel tabsId="project-tabs" active={activeTab}>

        {activeTab === "overview" && (
          <>
            {project && can("projects.manage") && (
              <label className="mt-4 flex w-fit items-center gap-2 text-xs text-fg-subtle">
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
            {project && can("projects.manage") && (
              <label className="mt-2 flex w-fit items-center gap-2 text-xs text-fg-subtle">
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
            {project && can("projects.manage") && (
              <label className="mt-2 flex w-fit items-center gap-2 text-xs text-fg-subtle">
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
              <h2 className="mb-3 text-sm font-semibold text-fg-muted">{tp("projectChannel")}</h2>
              <div className="card">
                <CommentsThread param="projectId" entityId={projectId} />
              </div>
            </div>

            {can("clients.view") && <PortalMessagesPanel projectId={projectId} />}
            {can("estimates.view") && <ClientChangeRequestsPanel projectId={projectId} />}

            {canEstimates && (
            <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
              <div className="card lg:col-span-1">
                <h2 className="mb-4 text-sm font-semibold text-fg-muted">{t("newEstimate")}</h2>
                <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
                  {templates.length > 0 && (
                    <Field label={t("startFromTemplate")} size="sm">
                      <select className="input" value={form.templateId} onChange={(e) => updateEstimateField("templateId", e.target.value)}>
                        <option value="">{t("blankEstimate")}</option>
                        {templates.map((tpl) => (
                          <option key={tpl.id} value={tpl.id}>
                            {tpl.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field label={tc("name")} size="sm" error={errors.name}>
                    <input required className="input" value={form.name} onChange={(e) => updateEstimateField("name", e.target.value)} />
                  </Field>
                  <Field label={`${t("laborRate")} (${me?.company.currency ?? ""})`} size="sm" error={errors.laborRatePerHour}>
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0"
                      className="input"
                      value={form.laborRatePerHour}
                      onChange={(e) => updateEstimateField("laborRatePerHour", e.target.value)}
                    />
                  </Field>
                  <Field label={t("markup")} size="sm" error={errors.markupPercent}>
                    <input
                      required
                      type="number"
                      step="0.1"
                      min="0"
                      max="500"
                      className="input"
                      value={form.markupPercent}
                      onChange={(e) => updateEstimateField("markupPercent", e.target.value)}
                    />
                  </Field>
                  <Field label={t("tax")} size="sm" error={errors.taxPercent}>
                    <input
                      required
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      className="input"
                      value={form.taxPercent}
                      onChange={(e) => updateEstimateField("taxPercent", e.target.value)}
                    />
                  </Field>
                  <FormError>{submitError}</FormError>
                  <Button type="submit" loading={submitting}>
                    {tc("create")}
                  </Button>
                </form>
              </div>

              <div className="lg:col-span-2">
                <h2 className="mb-3 text-sm font-semibold text-fg-muted">{tp("viewEstimates")}</h2>
                {!estimates ? (
                  estimatesError ? <ErrorState error={estimatesError} onRetry={reloadEstimates} compact /> : <Skeleton lines={3} />
                ) : estimates.length === 0 ? (
                  <p className="text-fg-subtle">{t("noEstimatesForProject")}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {estimates.map((e) => (
                      <li key={e.id}>
                        <a href={`/estimates/${e.id}`} className="card flex items-center justify-between hover:border-gray-400">
                          <span className="font-medium">{e.name}</span>
                          <span className="text-sm text-fg-subtle">
                            {e.status === "approved" ? t("approved") : t("draft")} · {formatCurrency(e.grandTotal, me?.company.currency)}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            )}

            {can("site.manage") && <ProjectMembersPanel projectId={projectId} />}
            <CustomFieldsValuesPanel entityType="project" entityId={projectId} />
          </>
        )}

        {activeTab === "schedule" && <ScheduleTab projectId={projectId} />}
        {activeTab === "financials" && <FinancialsTab projectId={projectId} />}
        {activeTab === "field" && <FieldTab projectId={projectId} />}
        {activeTab === "quality" && <QualityTab projectId={projectId} project={project} />}
        {activeTab === "compliance" && <ComplianceTab projectId={projectId} />}
        {activeTab === "subcontractors" && <SubcontractorsTab projectId={projectId} />}
        {activeTab === "documents" && <DocumentsTab projectId={projectId} project={project} />}
      </TabPanel>
    </>
  );
}
