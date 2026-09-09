"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { HR_CASE_ACTION_TYPES, HR_CASE_CATEGORIES, type HrCaseActionType, type HrCaseCategory, type HrCaseStatus } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface HrCaseAction {
  id: string;
  type: HrCaseActionType;
  description: string;
  actionDate: string;
  createdByName: string;
  acknowledgedAt: string | null;
}
interface HrCase {
  id: string;
  category: HrCaseCategory;
  status: HrCaseStatus;
  description: string;
  createdAt: string;
}
interface HrCaseDetail extends HrCase {
  actions: HrCaseAction[];
}

/** Manager-only worker HR case tracking — attendance/conduct incidents, each with its own action log. */
export function WorkerHrCasesPanel({ workerId }: { workerId: string }) {
  const tc = useTranslations("common");
  const th = useTranslations("hrCases");

  const [hrCases, setHrCases] = useState<HrCase[] | null>(null);
  const [hrCaseExpandedId, setHrCaseExpandedId] = useState<string | null>(null);
  const [hrCaseDetail, setHrCaseDetail] = useState<HrCaseDetail | null>(null);
  const [hrCaseForm, setHrCaseForm] = useState({ category: "attendance" as HrCaseCategory, description: "" });
  const [hrActionForm, setHrActionForm] = useState({ type: "note" as HrCaseActionType, description: "" });
  const [addingHrCase, setAddingHrCase] = useState(false);
  const [hrCaseBusy, setHrCaseBusy] = useState(false);

  function load() {
    apiFetch<HrCase[]>(`/workers/${workerId}/hr-cases`).then(setHrCases);
  }

  useEffect(load, [workerId]);

  async function openHrCase(e: React.FormEvent) {
    e.preventDefault();
    if (!hrCaseForm.description.trim()) return;
    setHrCaseBusy(true);
    try {
      await apiFetch(`/workers/${workerId}/hr-cases`, {
        method: "POST",
        body: JSON.stringify({ category: hrCaseForm.category, description: hrCaseForm.description.trim() }),
      });
      setHrCaseForm({ category: "attendance", description: "" });
      setAddingHrCase(false);
      load();
    } finally {
      setHrCaseBusy(false);
    }
  }

  async function toggleHrCaseExpand(id: string) {
    if (hrCaseExpandedId === id) {
      setHrCaseExpandedId(null);
      setHrCaseDetail(null);
      return;
    }
    setHrCaseExpandedId(id);
    const d = await apiFetch<HrCaseDetail>(`/hr-cases/${id}`);
    setHrCaseDetail(d);
  }

  async function addHrCaseAction(caseId: string) {
    if (!hrActionForm.description.trim()) return;
    setHrCaseBusy(true);
    try {
      await apiFetch(`/hr-cases/${caseId}/actions`, {
        method: "POST",
        body: JSON.stringify({ type: hrActionForm.type, description: hrActionForm.description.trim() }),
      });
      setHrActionForm({ type: "note", description: "" });
      const d = await apiFetch<HrCaseDetail>(`/hr-cases/${caseId}`);
      setHrCaseDetail(d);
    } finally {
      setHrCaseBusy(false);
    }
  }

  async function updateHrCaseStatus(caseId: string, status: HrCaseStatus) {
    setHrCaseBusy(true);
    try {
      await apiFetch(`/hr-cases/${caseId}/status`, { method: "POST", body: JSON.stringify({ status }) });
      load();
      const d = await apiFetch<HrCaseDetail>(`/hr-cases/${caseId}`);
      setHrCaseDetail(d);
    } finally {
      setHrCaseBusy(false);
    }
  }

  return (
    <>
      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{th("title")}</h2>
        {!addingHrCase && (
          <button onClick={() => setAddingHrCase(true)} className="btn-secondary px-2 py-1 text-xs">
            {th("openCase")}
          </button>
        )}
      </div>

      {addingHrCase && (
        <form onSubmit={openHrCase} className="card mb-3 flex flex-col gap-2">
          <select className="input" value={hrCaseForm.category} onChange={(e) => setHrCaseForm((f) => ({ ...f, category: e.target.value as HrCaseCategory }))}>
            {HR_CASE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {th(`category_${c}`)}
              </option>
            ))}
          </select>
          <textarea
            required
            rows={2}
            placeholder={th("descriptionPlaceholder")}
            className="input"
            value={hrCaseForm.description}
            onChange={(e) => setHrCaseForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={hrCaseBusy} className="btn-primary px-3 py-1 text-xs">
              {th("openCase")}
            </button>
            <button type="button" onClick={() => setAddingHrCase(false)} className="btn-secondary px-3 py-1 text-xs">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {hrCases === null ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : hrCases.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{th("noCases")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {hrCases.map((c) => {
            const expanded = hrCaseExpandedId === c.id;
            return (
              <li key={c.id} className="card text-sm">
                <button onClick={() => toggleHrCaseExpand(c.id)} className="flex w-full items-center justify-between text-left">
                  <span>{th(`category_${c.category}`)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.status === "closed" || c.status === "resolved" ? "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500" : "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500"
                    }`}
                  >
                    {th(`caseStatus_${c.status}`)}
                  </span>
                </button>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{c.description}</p>

                {expanded && hrCaseDetail && hrCaseDetail.id === c.id && (
                  <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 dark:border-gray-700 pt-2">
                    {c.status !== "closed" && (
                      <div className="flex flex-wrap gap-1.5">
                        {(["investigating", "resolved", "closed"] as HrCaseStatus[])
                          .filter((s) => s !== c.status)
                          .map((s) => (
                            <button key={s} onClick={() => updateHrCaseStatus(c.id, s)} disabled={hrCaseBusy} className="btn-secondary px-2 py-1 text-xs">
                              {th(`moveTo_${s}`)}
                            </button>
                          ))}
                      </div>
                    )}
                    <ul className="flex flex-col gap-1">
                      {hrCaseDetail.actions.map((a) => (
                        <li key={a.id} className="text-xs">
                          <span className="font-medium text-gray-700 dark:text-gray-200">{th(`actionType_${a.type}`)}</span> — {a.description}
                          <span className="text-gray-400 dark:text-gray-500"> ({a.createdByName}, {formatDate(new Date(a.actionDate))})</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap items-end gap-2">
                      <select
                        className="input w-auto"
                        value={hrActionForm.type}
                        onChange={(e) => setHrActionForm((f) => ({ ...f, type: e.target.value as HrCaseActionType }))}
                      >
                        {HR_CASE_ACTION_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {th(`actionType_${type}`)}
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder={th("actionDescriptionPlaceholder")}
                        className="input flex-1"
                        value={hrActionForm.description}
                        onChange={(e) => setHrActionForm((f) => ({ ...f, description: e.target.value }))}
                      />
                      <button onClick={() => addHrCaseAction(c.id)} disabled={hrCaseBusy} className="btn-secondary shrink-0 px-2 py-1 text-xs">
                        {th("logAction")}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
