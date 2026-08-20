"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { SchedulingPanel } from "@/components/scheduling-panel";
import { DailyLogsPanel } from "@/components/daily-logs-panel";
import { PunchListPanel } from "@/components/punch-list-panel";
import { RfiPanel } from "@/components/rfi-panel";
import { SafetyPanel } from "@/components/safety-panel";
import { SubmittalsPanel } from "@/components/submittals-panel";
import { WarrantyPanel } from "@/components/warranty-panel";
import { BudgetPanel } from "@/components/budget-panel";
import { TimeTrackingPanel } from "@/components/time-tracking-panel";
import { SubcontractorCostsPanel } from "@/components/subcontractor-costs-panel";
import { SubcontractorAssignmentsPanel } from "@/components/subcontractor-assignments-panel";
import { DocumentsPanel } from "@/components/documents-panel";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface Project {
  id: string;
  name: string;
  address: string | null;
  client: { id: string; name: string } | null;
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

  useEffect(() => {
    apiFetch<Project>(`/projects/${projectId}`).then(setProject);
    apiFetch<Estimate[]>("/estimates").then((all) => setEstimates(all.filter((e) => e.project.id === projectId)));
    apiFetch<Template[]>("/estimates/templates").then(setTemplates);
  }, [projectId]);

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
      <h1 className="mt-2 text-2xl font-semibold">{project?.name ?? tc("loading")}</h1>
      {project?.client && <p className="text-sm text-gray-500">{project.client.name}</p>}

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

      <SchedulingPanel projectId={projectId} />
      <DailyLogsPanel projectId={projectId} />
      <PunchListPanel projectId={projectId} />
      <RfiPanel projectId={projectId} />
      <SafetyPanel projectId={projectId} />
      <SubmittalsPanel projectId={projectId} />
      <WarrantyPanel projectId={projectId} />
      <TimeTrackingPanel projectId={projectId} />
      <SubcontractorAssignmentsPanel projectId={projectId} />
      <SubcontractorCostsPanel projectId={projectId} />
      <BudgetPanel projectId={projectId} />
      <DocumentsPanel projectId={projectId} />
    </AuthenticatedShell>
  );
}
