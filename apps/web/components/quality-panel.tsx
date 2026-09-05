"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DEFICIENCY_SEVERITIES, INSPECTION_ITEM_RESULTS, type DeficiencySeverity, type InspectionItemResult } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { PhotoAttachments } from "@/components/photo-attachments";

interface Worker {
  id: string;
  name: string;
}
interface InspectionTemplate {
  id: string;
  name: string;
  trade: string;
}
interface ChecklistItem {
  id: string;
  description: string;
  result: InspectionItemResult;
  notes: string | null;
}
interface Checklist {
  id: string;
  name: string;
  trade: string;
  phase: string | null;
  status: "open" | "passed" | "failed";
  inspector: Worker | null;
  inspectedAt: string | null;
  items: ChecklistItem[];
}
interface Deficiency {
  id: string;
  description: string;
  severity: DeficiencySeverity;
  status: "open" | "resolved" | "verified";
  assignee: Worker | null;
  dueDate: string | null;
  location: string | null;
  inspectionChecklistItem: { id: string; description: string } | null;
}
interface HeatmapBucket {
  location: string;
  total: number;
  minor: number;
  major: number;
  critical: number;
}

const STATUS_STYLES: Record<Checklist["status"], string> = {
  open: "bg-gray-100 text-gray-600",
  passed: "bg-success-50 text-success-700",
  failed: "bg-error-50 text-error-700",
};
const SEVERITY_STYLES: Record<DeficiencySeverity, string> = {
  minor: "bg-gray-100 text-gray-600",
  major: "bg-warning-50 text-warning-700",
  critical: "bg-error-50 text-error-700",
};
const DEFICIENCY_STATUS_STYLES: Record<Deficiency["status"], string> = {
  open: "bg-error-50 text-error-700",
  resolved: "bg-warning-50 text-warning-700",
  verified: "bg-success-50 text-success-700",
};

const EMPTY_CHECKLIST_FORM = { name: "", trade: "", phase: "", templateId: "", inspectorWorkerId: "", adHocItems: "" };

export function QualityPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("quality");
  const tc = useTranslations("common");

  const [checklists, setChecklists] = useState<Checklist[] | null>(null);
  const [deficiencies, setDeficiencies] = useState<Deficiency[] | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapBucket[] | null>(null);
  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [creating, setCreating] = useState(false);
  const [checklistForm, setChecklistForm] = useState(EMPTY_CHECKLIST_FORM);
  const [deficiencyDraft, setDeficiencyDraft] = useState<{ checklistId: string; itemId: string } | null>(null);
  const [deficiencyForm, setDeficiencyForm] = useState({
    description: "",
    severity: "minor" as DeficiencySeverity,
    assigneeWorkerId: "",
    dueDate: "",
    location: "",
  });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Checklist[]>(`/inspection-checklists?projectId=${projectId}`).then(setChecklists);
    apiFetch<Deficiency[]>(`/deficiencies?projectId=${projectId}`).then(setDeficiencies);
    apiFetch<HeatmapBucket[]>(`/deficiencies/heat-map?projectId=${projectId}`).then(setHeatmap);
  }

  useEffect(() => {
    load();
    apiFetch<InspectionTemplate[]>("/inspection-templates").then(setTemplates);
    apiFetch<Worker[]>("/workers").then(setWorkers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function createChecklist(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const template = templates.find((tpl) => tpl.id === checklistForm.templateId);
      await apiFetch("/inspection-checklists", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          templateId: checklistForm.templateId || undefined,
          name: checklistForm.name,
          trade: checklistForm.trade || template?.trade || "",
          phase: checklistForm.phase || undefined,
          inspectorWorkerId: checklistForm.inspectorWorkerId || undefined,
          items: checklistForm.templateId
            ? undefined
            : checklistForm.adHocItems
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((description) => ({ description })),
        }),
      });
      setChecklistForm(EMPTY_CHECKLIST_FORM);
      setCreating(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function recordResult(checklistId: string, itemId: string, result: InspectionItemResult) {
    await apiFetch(`/inspection-checklists/${checklistId}/items/${itemId}/result`, {
      method: "POST",
      body: JSON.stringify({ result }),
    });
    load();
  }

  async function completeChecklist(checklistId: string) {
    await apiFetch(`/inspection-checklists/${checklistId}/complete`, { method: "POST" });
    load();
  }

  function startDeficiency(checklistId: string, item: ChecklistItem) {
    setDeficiencyDraft({ checklistId, itemId: item.id });
    setDeficiencyForm({ description: item.description, severity: "minor", assigneeWorkerId: "", dueDate: "", location: "" });
  }

  async function submitDeficiency() {
    if (!deficiencyDraft) return;
    setBusy(true);
    try {
      await apiFetch(`/inspection-checklists/${deficiencyDraft.checklistId}/items/${deficiencyDraft.itemId}/deficiency`, {
        method: "POST",
        body: JSON.stringify({
          description: deficiencyForm.description || undefined,
          severity: deficiencyForm.severity,
          assigneeWorkerId: deficiencyForm.assigneeWorkerId || undefined,
          dueDate: deficiencyForm.dueDate ? new Date(deficiencyForm.dueDate).toISOString() : undefined,
          location: deficiencyForm.location.trim() || undefined,
        }),
      });
      setDeficiencyDraft(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function transitionDeficiency(id: string, action: "resolve" | "verify" | "reopen") {
    await apiFetch(`/deficiencies/${id}/${action}`, { method: "POST" });
    load();
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("title")}</h2>

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("inspections")}</h3>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newInspection")}
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={createChecklist} className="card mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <input
              required
              placeholder={tc("name")}
              className="input"
              value={checklistForm.name}
              onChange={(e) => setChecklistForm((f) => ({ ...f, name: e.target.value }))}
            />
            <select
              className="input"
              value={checklistForm.templateId}
              onChange={(e) => setChecklistForm((f) => ({ ...f, templateId: e.target.value }))}
            >
              <option value="">{t("adHocChecklist")}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} ({tpl.trade})
                </option>
              ))}
            </select>
            {!checklistForm.templateId && (
              <input
                required
                placeholder={t("trade")}
                className="input"
                value={checklistForm.trade}
                onChange={(e) => setChecklistForm((f) => ({ ...f, trade: e.target.value }))}
              />
            )}
            <input
              placeholder={t("phase")}
              className="input"
              value={checklistForm.phase}
              onChange={(e) => setChecklistForm((f) => ({ ...f, phase: e.target.value }))}
            />
            <select
              className="input"
              value={checklistForm.inspectorWorkerId}
              onChange={(e) => setChecklistForm((f) => ({ ...f, inspectorWorkerId: e.target.value }))}
            >
              <option value="">{t("inspector")}</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          {!checklistForm.templateId && (
            <textarea
              required
              rows={3}
              className="input"
              placeholder={t("adHocItemsPlaceholder")}
              value={checklistForm.adHocItems}
              onChange={(e) => setChecklistForm((f) => ({ ...f, adHocItems: e.target.value }))}
            />
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("create")}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {checklists === null ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : checklists.length === 0 ? (
        <p className="mb-6 text-sm text-gray-400">{t("noInspections")}</p>
      ) : (
        <ul className="mb-6 flex flex-col gap-3">
          {checklists.map((cl) => (
            <li key={cl.id} className="card">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">{cl.name}</span>
                <span className="text-xs text-gray-500">
                  {cl.trade}
                  {cl.phase ? ` · ${cl.phase}` : ""}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[cl.status]}`}>{t(`status_${cl.status}`)}</span>
              </div>
              {cl.inspector && <p className="mt-1 text-xs text-gray-400">{t("inspectorLabel", { name: cl.inspector.name })}</p>}

              <ul className="mt-2 flex flex-col gap-1.5">
                {cl.items.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="flex-1">{item.description}</span>
                    {cl.status === "open" ? (
                      <select
                        className="input w-auto py-0.5 text-xs"
                        value={item.result}
                        onChange={(e) => recordResult(cl.id, item.id, e.target.value as InspectionItemResult)}
                      >
                        {INSPECTION_ITEM_RESULTS.map((r) => (
                          <option key={r} value={r}>
                            {t(`result_${r}`)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-500">{t(`result_${item.result}`)}</span>
                    )}
                    {item.result === "fail" && cl.status === "open" && (
                      <button onClick={() => startDeficiency(cl.id, item)} className="text-xs text-error-700 hover:underline">
                        {t("raiseDeficiency")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {deficiencyDraft?.checklistId === cl.id && (
                <div className="mt-2 flex flex-col gap-1.5 border-t border-gray-100 pt-2">
                  <textarea
                    rows={2}
                    className="input text-xs"
                    value={deficiencyForm.description}
                    onChange={(e) => setDeficiencyForm((f) => ({ ...f, description: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    <select
                      className="input w-auto py-0.5 text-xs"
                      value={deficiencyForm.severity}
                      onChange={(e) => setDeficiencyForm((f) => ({ ...f, severity: e.target.value as DeficiencySeverity }))}
                    >
                      {DEFICIENCY_SEVERITIES.map((s) => (
                        <option key={s} value={s}>
                          {t(`severity_${s}`)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="input w-auto py-0.5 text-xs"
                      value={deficiencyForm.assigneeWorkerId}
                      onChange={(e) => setDeficiencyForm((f) => ({ ...f, assigneeWorkerId: e.target.value }))}
                    >
                      <option value="">{t("assignee")}</option>
                      {workers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      className="input w-auto py-0.5 text-xs"
                      value={deficiencyForm.dueDate}
                      onChange={(e) => setDeficiencyForm((f) => ({ ...f, dueDate: e.target.value }))}
                    />
                    <input
                      placeholder={t("locationPlaceholder")}
                      className="input w-auto py-0.5 text-xs"
                      value={deficiencyForm.location}
                      onChange={(e) => setDeficiencyForm((f) => ({ ...f, location: e.target.value }))}
                    />
                    <button onClick={submitDeficiency} disabled={busy} className="btn-primary px-2 py-1 text-xs">
                      {tc("save")}
                    </button>
                    <button onClick={() => setDeficiencyDraft(null)} className="btn-secondary px-2 py-1 text-xs">
                      {tc("cancel")}
                    </button>
                  </div>
                </div>
              )}

              {cl.status === "open" && (
                <button onClick={() => completeChecklist(cl.id)} className="btn-secondary mt-3 px-3 py-1 text-xs">
                  {t("completeInspection")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {heatmap && heatmap.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("heatmapTitle")}</h3>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="py-1">{t("location")}</th>
                  <th className="text-right">{t("severity_minor")}</th>
                  <th className="text-right">{t("severity_major")}</th>
                  <th className="text-right">{t("severity_critical")}</th>
                  <th className="text-right">{t("total")}</th>
                </tr>
              </thead>
              <tbody>
                {heatmap.map((row) => (
                  <tr key={row.location} className="border-b border-gray-100">
                    <td className="py-1.5">{row.location}</td>
                    <td className="text-right tabular-nums text-gray-500">{row.minor}</td>
                    <td className="text-right tabular-nums text-warning-700">{row.major}</td>
                    <td className="text-right tabular-nums text-error-600">{row.critical}</td>
                    <td className="text-right font-semibold tabular-nums text-gray-900">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("deficiencies")}</h3>
      {deficiencies === null ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : deficiencies.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noDeficiencies")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {deficiencies.map((d) => (
            <li key={d.id} className="card">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[d.severity]}`}>{t(`severity_${d.severity}`)}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DEFICIENCY_STATUS_STYLES[d.status]}`}>{t(`deficiencyStatus_${d.status}`)}</span>
                {d.dueDate && <span className="text-xs text-gray-500">{new Date(d.dueDate).toLocaleDateString()}</span>}
                {d.location && <span className="text-xs text-gray-500">{d.location}</span>}
              </div>
              <p className="mt-1.5 text-sm text-gray-900">{d.description}</p>
              {d.assignee && <p className="mt-1 text-xs text-gray-400">{t("assignedTo", { name: d.assignee.name })}</p>}
              <div className="mt-2">
                <PhotoAttachments param="deficiencyId" entityId={d.id} />
              </div>
              <div className="mt-2 flex gap-2">
                {d.status === "open" && (
                  <button onClick={() => transitionDeficiency(d.id, "resolve")} className="btn-secondary px-2 py-1 text-xs">
                    {t("markResolved")}
                  </button>
                )}
                {d.status === "resolved" && (
                  <button onClick={() => transitionDeficiency(d.id, "verify")} className="btn-secondary px-2 py-1 text-xs">
                    {t("verifyFix")}
                  </button>
                )}
                {d.status !== "open" && (
                  <button onClick={() => transitionDeficiency(d.id, "reopen")} className="text-xs text-gray-400 hover:text-error-600">
                    {t("reopen")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
