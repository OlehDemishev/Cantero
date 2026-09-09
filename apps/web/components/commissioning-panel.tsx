"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { CommissioningSystemStatus, FunctionalTestResult } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface ChecklistItem {
  id: string;
  description: string;
  done: boolean;
  completedByName: string | null;
}
interface FunctionalTest {
  id: string;
  procedure: string;
  result: FunctionalTestResult;
  testedByName: string;
  testedAt: string;
}
interface TrainingSession {
  id: string;
  trainerName: string;
  trainingDate: string;
  attendeeNames: string | null;
  ownerSignedOffAt: string | null;
  ownerSignerName: string | null;
}
interface CommissioningSystem {
  id: string;
  name: string;
  category: string | null;
  status: CommissioningSystemStatus;
  checklistItems: ChecklistItem[];
  functionalTests: FunctionalTest[];
  trainingSessions: TrainingSession[];
}

const STATUS_STYLES: Record<CommissioningSystemStatus, string> = {
  pending_testing: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
  testing: "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500",
  complete: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
};

export function CommissioningPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("commissioning");
  const tc = useTranslations("common");

  const [systems, setSystems] = useState<CommissioningSystem[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", category: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [checklistText, setChecklistText] = useState("");
  const [testForm, setTestForm] = useState({ procedure: "", result: "pass" as FunctionalTestResult, testedByName: "" });
  const [trainingForm, setTrainingForm] = useState({ trainerName: "", trainingDate: "", attendeeNames: "" });
  const [signingId, setSigningId] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<CommissioningSystem[]>(`/projects/${projectId}/commissioning-systems`).then(setSystems);
  }
  useEffect(load, [projectId]);

  async function createSystem(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/commissioning-systems`, {
        method: "POST",
        body: JSON.stringify({ name: form.name.trim(), category: form.category || undefined }),
      });
      setForm({ name: "", category: "" });
      setAdding(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function addChecklistItem(systemId: string) {
    if (!checklistText.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/commissioning-systems/${systemId}/checklist-items`, {
        method: "POST",
        body: JSON.stringify({ description: checklistText.trim() }),
      });
      setChecklistText("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleChecklistItem(id: string) {
    await apiFetch(`/commissioning-checklist-items/${id}/toggle`, { method: "POST" });
    load();
  }

  async function addTest(systemId: string) {
    if (!testForm.procedure.trim() || !testForm.testedByName.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/commissioning-systems/${systemId}/functional-tests`, {
        method: "POST",
        body: JSON.stringify(testForm),
      });
      setTestForm({ procedure: "", result: "pass", testedByName: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function scheduleTraining(systemId: string) {
    if (!trainingForm.trainerName.trim() || !trainingForm.trainingDate) return;
    setBusy(true);
    try {
      await apiFetch(`/commissioning-systems/${systemId}/training-sessions`, {
        method: "POST",
        body: JSON.stringify({
          trainerName: trainingForm.trainerName.trim(),
          trainingDate: new Date(trainingForm.trainingDate).toISOString(),
          attendeeNames: trainingForm.attendeeNames || undefined,
        }),
      });
      setTrainingForm({ trainerName: "", trainingDate: "", attendeeNames: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function signOff(sessionId: string) {
    if (!signerName.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/owner-training-sessions/${sessionId}/sign-off`, {
        method: "POST",
        body: JSON.stringify({ ownerSignerName: signerName.trim() }),
      });
      setSigningId(null);
      setSignerName("");
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn-secondary px-2.5 py-1 text-xs">
            {t("addSystem")}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      {adding && (
        <form onSubmit={createSystem} className="card mb-3 flex flex-wrap items-end gap-2">
          <input required placeholder={t("namePlaceholder")} className="input flex-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input placeholder={t("categoryPlaceholder")} className="input w-40" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          <button type="submit" disabled={busy} className="btn-primary">
            {tc("save")}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="btn-secondary">
            {tc("cancel")}
          </button>
        </form>
      )}

      {!systems ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      ) : systems.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noSystems")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {systems.map((sys) => {
            const expanded = expandedId === sys.id;
            return (
              <li key={sys.id} className="card">
                <button onClick={() => setExpandedId(expanded ? null : sys.id)} className="flex w-full items-center justify-between text-left">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                    {sys.name}
                    {sys.category && <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">({sys.category})</span>}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[sys.status]}`}>{t(`status_${sys.status}`)}</span>
                </button>

                {expanded && (
                  <div className="mt-3 flex flex-col gap-4 border-t border-gray-100 dark:border-gray-700 pt-3">
                    <div>
                      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("checklist")}</h3>
                      {sys.checklistItems.length > 0 && (
                        <ul className="mb-2 flex flex-col gap-1">
                          {sys.checklistItems.map((item) => (
                            <li key={item.id} className="flex items-center gap-2 text-sm">
                              <input type="checkbox" checked={item.done} onChange={() => toggleChecklistItem(item.id)} />
                              <span className={item.done ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-700 dark:text-gray-200"}>{item.description}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex gap-2">
                        <input
                          placeholder={t("checklistItemPlaceholder")}
                          className="input flex-1"
                          value={checklistText}
                          onChange={(e) => setChecklistText(e.target.value)}
                        />
                        <button onClick={() => addChecklistItem(sys.id)} disabled={busy} className="btn-secondary shrink-0 px-2.5 py-1 text-xs">
                          {t("addItem")}
                        </button>
                      </div>
                    </div>

                    <div>
                      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("functionalTests")}</h3>
                      {sys.functionalTests.length > 0 && (
                        <ul className="mb-2 flex flex-col gap-1 text-xs">
                          {sys.functionalTests.map((test) => (
                            <li key={test.id}>
                              <span className={test.result === "fail" ? "font-medium text-error-700 dark:text-error-500" : "text-success-700 dark:text-success-500"}>{t(`result_${test.result}`)}</span> —{" "}
                              {test.procedure} ({test.testedByName}, {formatDate(new Date(test.testedAt))})
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <input
                          placeholder={t("procedurePlaceholder")}
                          className="input flex-1"
                          value={testForm.procedure}
                          onChange={(e) => setTestForm((f) => ({ ...f, procedure: e.target.value }))}
                        />
                        <select className="input" value={testForm.result} onChange={(e) => setTestForm((f) => ({ ...f, result: e.target.value as FunctionalTestResult }))}>
                          <option value="pass">{t("result_pass")}</option>
                          <option value="fail">{t("result_fail")}</option>
                        </select>
                        <input
                          placeholder={t("testedByPlaceholder")}
                          className="input w-32"
                          value={testForm.testedByName}
                          onChange={(e) => setTestForm((f) => ({ ...f, testedByName: e.target.value }))}
                        />
                        <button onClick={() => addTest(sys.id)} disabled={busy} className="btn-secondary shrink-0 px-2.5 py-1 text-xs">
                          {t("logTest")}
                        </button>
                      </div>
                    </div>

                    <div>
                      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("ownerTraining")}</h3>
                      {sys.trainingSessions.length > 0 && (
                        <ul className="mb-2 flex flex-col gap-1.5 text-xs">
                          {sys.trainingSessions.map((session) => (
                            <li key={session.id}>
                              <div className="flex items-center justify-between">
                                <span>
                                  {session.trainerName} — {formatDate(new Date(session.trainingDate))}
                                  {session.attendeeNames && <span className="text-gray-400 dark:text-gray-500"> · {session.attendeeNames}</span>}
                                </span>
                                {session.ownerSignedOffAt ? (
                                  <span className="text-success-700 dark:text-success-500">{t("signedOffBy", { name: session.ownerSignerName ?? "" })}</span>
                                ) : signingId === session.id ? (
                                  <span className="flex items-center gap-1.5">
                                    <input
                                      className="input w-32 py-0.5 text-xs"
                                      placeholder={t("ownerSignerPlaceholder")}
                                      value={signerName}
                                      onChange={(e) => setSignerName(e.target.value)}
                                    />
                                    <button onClick={() => signOff(session.id)} disabled={busy} className="btn-primary px-2 py-0.5 text-xs">
                                      {tc("save")}
                                    </button>
                                  </span>
                                ) : (
                                  <button onClick={() => setSigningId(session.id)} className="text-brand-700 dark:text-brand-400 hover:underline">
                                    {t("signOff")}
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <input
                          placeholder={t("trainerNamePlaceholder")}
                          className="input"
                          value={trainingForm.trainerName}
                          onChange={(e) => setTrainingForm((f) => ({ ...f, trainerName: e.target.value }))}
                        />
                        <input
                          type="date"
                          className="input"
                          value={trainingForm.trainingDate}
                          onChange={(e) => setTrainingForm((f) => ({ ...f, trainingDate: e.target.value }))}
                        />
                        <input
                          placeholder={t("attendeeNamesPlaceholder")}
                          className="input flex-1"
                          value={trainingForm.attendeeNames}
                          onChange={(e) => setTrainingForm((f) => ({ ...f, attendeeNames: e.target.value }))}
                        />
                        <button onClick={() => scheduleTraining(sys.id)} disabled={busy} className="btn-secondary shrink-0 px-2.5 py-1 text-xs">
                          {t("scheduleTraining")}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
