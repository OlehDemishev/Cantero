"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { INCIDENT_SEVERITIES, OSHA_CASE_TYPES, type IncidentSeverity, type OshaCaseType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { PhotoAttachments } from "@/components/photo-attachments";
import { TemplatePicker } from "@/components/template-picker";
import { PrintButton } from "@/components/ui/print-button";
import { formatDate } from "@/lib/format-date";

interface Worker {
  id: string;
  name: string;
}
interface IncidentReport {
  id: string;
  occurredAt: string;
  severity: IncidentSeverity;
  description: string;
  location: string | null;
  involvedPersons: string | null;
  correctiveActions: string | null;
  oshaRecordable: boolean;
  oshaCaseType: OshaCaseType | null;
  daysAwayFromWork: number | null;
  daysJobTransferOrRestriction: number | null;
  reportedByName: string;
}
interface SafetyBriefing {
  id: string;
  date: string;
  topic: string;
  notes: string | null;
  conductedByName: string;
  attendees: { worker: Worker }[];
}
interface Jha {
  id: string;
  date: string;
  taskDescription: string;
  hazards: string;
  controlMeasures: string;
  requiredPpe: string | null;
  conductedByName: string;
  acknowledgments: { worker: Worker }[];
}

const SEVERITY_STYLES: Record<IncidentSeverity, string> = {
  near_miss: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
  first_aid: "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400",
  medical_treatment: "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500",
  lost_time_injury: "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500",
  fatality: "bg-error-600 text-white",
};

const EMPTY_INCIDENT_FORM = {
  occurredAt: new Date().toISOString().slice(0, 10),
  severity: "near_miss" as IncidentSeverity,
  description: "",
  location: "",
  involvedPersons: "",
  correctiveActions: "",
  oshaRecordable: false,
  oshaCaseType: "injury" as OshaCaseType,
  daysAwayFromWork: "",
  daysJobTransferOrRestriction: "",
};
const EMPTY_BRIEFING_FORM = { date: new Date().toISOString().slice(0, 10), topic: "", notes: "", attendeeWorkerIds: [] as string[] };
const EMPTY_JHA_FORM = {
  date: new Date().toISOString().slice(0, 10),
  taskDescription: "",
  hazards: "",
  controlMeasures: "",
  requiredPpe: "",
  acknowledgedWorkerIds: [] as string[],
};

export function SafetyPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("safety");
  const tc = useTranslations("common");

  const [incidents, setIncidents] = useState<IncidentReport[] | null>(null);
  const [briefings, setBriefings] = useState<SafetyBriefing[] | null>(null);
  const [jhas, setJhas] = useState<Jha[] | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [creatingIncident, setCreatingIncident] = useState(false);
  const [quickNearMiss, setQuickNearMiss] = useState(false);
  const [creatingBriefing, setCreatingBriefing] = useState(false);
  const [creatingJha, setCreatingJha] = useState(false);
  const [incidentForm, setIncidentForm] = useState(EMPTY_INCIDENT_FORM);
  const [briefingForm, setBriefingForm] = useState(EMPTY_BRIEFING_FORM);
  const [jhaForm, setJhaForm] = useState(EMPTY_JHA_FORM);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<IncidentReport[]>(`/safety/incidents?projectId=${projectId}`).then(setIncidents);
    apiFetch<SafetyBriefing[]>(`/safety/briefings?projectId=${projectId}`).then(setBriefings);
    apiFetch<Jha[]>(`/safety/jha?projectId=${projectId}`).then(setJhas);
  }

  useEffect(() => {
    load();
    apiFetch<Worker[]>("/workers").then(setWorkers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function submitIncident(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/safety/incidents", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          occurredAt: new Date(incidentForm.occurredAt).toISOString(),
          severity: incidentForm.severity,
          description: incidentForm.description,
          location: incidentForm.location || undefined,
          involvedPersons: quickNearMiss ? undefined : incidentForm.involvedPersons || undefined,
          correctiveActions: quickNearMiss ? undefined : incidentForm.correctiveActions || undefined,
          oshaRecordable: quickNearMiss ? false : incidentForm.oshaRecordable,
          oshaCaseType: !quickNearMiss && incidentForm.oshaRecordable ? incidentForm.oshaCaseType : undefined,
          daysAwayFromWork:
            !quickNearMiss && incidentForm.oshaRecordable && incidentForm.daysAwayFromWork
              ? Number(incidentForm.daysAwayFromWork)
              : undefined,
          daysJobTransferOrRestriction:
            !quickNearMiss && incidentForm.oshaRecordable && incidentForm.daysJobTransferOrRestriction
              ? Number(incidentForm.daysJobTransferOrRestriction)
              : undefined,
        }),
      });
      setIncidentForm(EMPTY_INCIDENT_FORM);
      setCreatingIncident(false);
      setQuickNearMiss(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function submitBriefing(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/safety/briefings", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          date: new Date(briefingForm.date).toISOString(),
          topic: briefingForm.topic,
          notes: briefingForm.notes || undefined,
          attendeeWorkerIds: briefingForm.attendeeWorkerIds,
        }),
      });
      setBriefingForm(EMPTY_BRIEFING_FORM);
      setCreatingBriefing(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  function toggleAttendee(workerId: string) {
    setBriefingForm((f) => ({
      ...f,
      attendeeWorkerIds: f.attendeeWorkerIds.includes(workerId)
        ? f.attendeeWorkerIds.filter((id) => id !== workerId)
        : [...f.attendeeWorkerIds, workerId],
    }));
  }

  async function submitJha(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/safety/jha", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          date: new Date(jhaForm.date).toISOString(),
          taskDescription: jhaForm.taskDescription,
          hazards: jhaForm.hazards,
          controlMeasures: jhaForm.controlMeasures,
          requiredPpe: jhaForm.requiredPpe || undefined,
          acknowledgedWorkerIds: jhaForm.acknowledgedWorkerIds,
        }),
      });
      setJhaForm(EMPTY_JHA_FORM);
      setCreatingJha(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  function toggleJhaAcknowledger(workerId: string) {
    setJhaForm((f) => ({
      ...f,
      acknowledgedWorkerIds: f.acknowledgedWorkerIds.includes(workerId)
        ? f.acknowledgedWorkerIds.filter((id) => id !== workerId)
        : [...f.acknowledgedWorkerIds, workerId],
    }));
  }

  async function acknowledgeJha(jhaId: string, workerId: string) {
    await apiFetch(`/safety/jha/${jhaId}/acknowledge`, { method: "POST", body: JSON.stringify({ workerIds: [workerId] }) });
    load();
  }

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
        <PrintButton />
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("incidents")}</h3>
        {!creatingIncident && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setIncidentForm((f) => ({ ...f, severity: "near_miss" }));
                setQuickNearMiss(true);
                setCreatingIncident(true);
              }}
              className="btn-secondary px-3 py-1 text-xs"
            >
              {t("quickNearMiss")}
            </button>
            <button onClick={() => setCreatingIncident(true)} className="btn-secondary px-3 py-1 text-xs">
              {t("newIncident")}
            </button>
          </div>
        )}
      </div>

      {creatingIncident && (
        <form onSubmit={submitIncident} className="card mb-4 flex flex-col gap-3">
          {quickNearMiss && <p className="text-xs text-gray-500 dark:text-gray-400">{t("quickNearMissHint")}</p>}
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("occurredAt")}</span>
              <input
                type="date"
                required
                className="input"
                value={incidentForm.occurredAt}
                onChange={(e) => setIncidentForm((f) => ({ ...f, occurredAt: e.target.value }))}
              />
            </label>
            {!quickNearMiss && (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-200">{t("severity")}</span>
                <select
                  className="input"
                  value={incidentForm.severity}
                  onChange={(e) => setIncidentForm((f) => ({ ...f, severity: e.target.value as IncidentSeverity }))}
                >
                  {INCIDENT_SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {t(`severity_${s}`)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("location")}</span>
              <input
                className="input"
                value={incidentForm.location}
                onChange={(e) => setIncidentForm((f) => ({ ...f, location: e.target.value }))}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("description")}</span>
            <textarea
              required
              rows={2}
              className="input"
              value={incidentForm.description}
              onChange={(e) => setIncidentForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          {!quickNearMiss && (
            <>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-200">{t("involvedPersons")}</span>
                <input
                  className="input"
                  placeholder={t("involvedPersonsPlaceholder")}
                  value={incidentForm.involvedPersons}
                  onChange={(e) => setIncidentForm((f) => ({ ...f, involvedPersons: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-200">{t("correctiveActions")}</span>
                <textarea
                  rows={2}
                  className="input"
                  value={incidentForm.correctiveActions}
                  onChange={(e) => setIncidentForm((f) => ({ ...f, correctiveActions: e.target.value }))}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={incidentForm.oshaRecordable}
                  onChange={(e) => setIncidentForm((f) => ({ ...f, oshaRecordable: e.target.checked }))}
                />
                <span className="font-medium text-gray-700 dark:text-gray-200">{t("oshaRecordable")}</span>
              </label>
              {incidentForm.oshaRecordable && (
                <div className="flex flex-wrap gap-3 rounded-lg border border-gray-100 dark:border-gray-700 p-3">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-200">{t("oshaCaseType")}</span>
                    <select
                      className="input"
                      value={incidentForm.oshaCaseType}
                      onChange={(e) => setIncidentForm((f) => ({ ...f, oshaCaseType: e.target.value as OshaCaseType }))}
                    >
                      {OSHA_CASE_TYPES.map((c) => (
                        <option key={c} value={c}>
                          {t(`oshaCaseType_${c}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-200">{t("daysAwayFromWork")}</span>
                    <input
                      type="number"
                      min="0"
                      className="input w-28"
                      value={incidentForm.daysAwayFromWork}
                      onChange={(e) => setIncidentForm((f) => ({ ...f, daysAwayFromWork: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-200">{t("daysJobTransferOrRestriction")}</span>
                    <input
                      type="number"
                      min="0"
                      className="input w-28"
                      value={incidentForm.daysJobTransferOrRestriction}
                      onChange={(e) => setIncidentForm((f) => ({ ...f, daysJobTransferOrRestriction: e.target.value }))}
                    />
                  </label>
                </div>
              )}
            </>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreatingIncident(false);
                setQuickNearMiss(false);
                setIncidentForm(EMPTY_INCIDENT_FORM);
              }}
              className="btn-secondary"
            >
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {incidents === null ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : incidents.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noIncidents")}</p>
      ) : (
        <ul className="mb-6 flex flex-col gap-2">
          {incidents.map((item) => (
            <li key={item.id} className="card">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[item.severity]}`}>
                  {t(`severity_${item.severity}`)}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(new Date(item.occurredAt))}</span>
                {item.location && <span className="text-xs text-gray-500 dark:text-gray-400">· {item.location}</span>}
                {item.oshaRecordable && (
                  <span className="rounded-full bg-error-50 dark:bg-error-500/15 px-2 py-0.5 text-xs font-medium text-error-700 dark:text-error-500">
                    {t("oshaRecordable")}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm text-gray-900 dark:text-gray-50">{item.description}</p>
              {item.oshaRecordable && (item.oshaCaseType || item.daysAwayFromWork || item.daysJobTransferOrRestriction) && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {item.oshaCaseType && t(`oshaCaseType_${item.oshaCaseType}`)}
                  {item.daysAwayFromWork ? ` · ${t("daysAwayFromWork")}: ${item.daysAwayFromWork}` : ""}
                  {item.daysJobTransferOrRestriction
                    ? ` · ${t("daysJobTransferOrRestriction")}: ${item.daysJobTransferOrRestriction}`
                    : ""}
                </p>
              )}
              {item.involvedPersons && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t("involvedPersons")}: {item.involvedPersons}
                </p>
              )}
              {item.correctiveActions && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t("correctiveActions")}: {item.correctiveActions}
                </p>
              )}
              <div className="mt-2">
                <PhotoAttachments param="incidentReportId" entityId={item.id} />
              </div>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-xs text-gray-400 dark:text-gray-500">{item.reportedByName}</p>
                <a
                  href={`/insurance-claims?projectId=${projectId}&incidentReportId=${item.id}`}
                  className="text-xs text-brand-700 dark:text-brand-400 hover:underline"
                >
                  {t("fileInsuranceClaim")}
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("briefings")}</h3>
        {!creatingBriefing && (
          <button onClick={() => setCreatingBriefing(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newBriefing")}
          </button>
        )}
      </div>

      {creatingBriefing && (
        <form onSubmit={submitBriefing} className="card mb-4 flex flex-col gap-3">
          <TemplatePicker
            type="safety_briefing"
            onSelect={({ subject, body }) => setBriefingForm((f) => ({ ...f, topic: subject, notes: body }))}
          />
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("topic")}</span>
              <input
                required
                className="input"
                placeholder={t("topicPlaceholder")}
                value={briefingForm.topic}
                onChange={(e) => setBriefingForm((f) => ({ ...f, topic: e.target.value }))}
              />
            </label>
            <label className="flex w-40 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("date")}</span>
              <input
                type="date"
                required
                className="input"
                value={briefingForm.date}
                onChange={(e) => setBriefingForm((f) => ({ ...f, date: e.target.value }))}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("notes")}</span>
            <textarea
              rows={2}
              className="input"
              value={briefingForm.notes}
              onChange={(e) => setBriefingForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("attendees")}</span>
            <div className="flex flex-wrap gap-2">
              {workers.map((w) => (
                <label
                  key={w.id}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${
                    briefingForm.attendeeWorkerIds.includes(w.id)
                      ? "border-brand-500 dark:border-brand-400 bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400"
                      : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                  }`}
                >
                  <input type="checkbox" className="hidden" checked={briefingForm.attendeeWorkerIds.includes(w.id)} onChange={() => toggleAttendee(w.id)} />
                  {w.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setCreatingBriefing(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {briefings === null ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : briefings.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noBriefings")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {briefings.map((item) => (
            <li key={item.id} className="card">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{item.topic}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(new Date(item.date))}</span>
              </div>
              {item.notes && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.notes}</p>}
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {t("attendeeCount", { count: item.attendees.length })}
                {item.attendees.length > 0 && ": " + item.attendees.map((a) => a.worker.name).join(", ")}
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{item.conductedByName}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="mb-2 mt-6 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("jhaTitle")}</h3>
        {!creatingJha && (
          <button onClick={() => setCreatingJha(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newJha")}
          </button>
        )}
      </div>

      {creatingJha && (
        <form onSubmit={submitJha} className="card mb-4 flex flex-col gap-3">
          <TemplatePicker
            type="jha"
            onSelect={({ subject, hazards, controlMeasures, ppe }) =>
              setJhaForm((f) => ({ ...f, taskDescription: subject, hazards, controlMeasures, requiredPpe: ppe }))
            }
          />
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("taskDescription")}</span>
              <input
                required
                className="input"
                placeholder={t("taskDescriptionPlaceholder")}
                value={jhaForm.taskDescription}
                onChange={(e) => setJhaForm((f) => ({ ...f, taskDescription: e.target.value }))}
              />
            </label>
            <label className="flex w-40 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("date")}</span>
              <input
                type="date"
                required
                className="input"
                value={jhaForm.date}
                onChange={(e) => setJhaForm((f) => ({ ...f, date: e.target.value }))}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("hazards")}</span>
            <textarea
              required
              rows={2}
              className="input"
              placeholder={t("hazardsPlaceholder")}
              value={jhaForm.hazards}
              onChange={(e) => setJhaForm((f) => ({ ...f, hazards: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("controlMeasures")}</span>
            <textarea
              required
              rows={2}
              className="input"
              placeholder={t("controlMeasuresPlaceholder")}
              value={jhaForm.controlMeasures}
              onChange={(e) => setJhaForm((f) => ({ ...f, controlMeasures: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("requiredPpe")}</span>
            <input
              className="input"
              placeholder={t("requiredPpePlaceholder")}
              value={jhaForm.requiredPpe}
              onChange={(e) => setJhaForm((f) => ({ ...f, requiredPpe: e.target.value }))}
            />
          </label>
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("acknowledgedBy")}</span>
            <div className="flex flex-wrap gap-2">
              {workers.map((w) => (
                <label
                  key={w.id}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${
                    jhaForm.acknowledgedWorkerIds.includes(w.id)
                      ? "border-brand-500 dark:border-brand-400 bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400"
                      : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={jhaForm.acknowledgedWorkerIds.includes(w.id)}
                    onChange={() => toggleJhaAcknowledger(w.id)}
                  />
                  {w.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setCreatingJha(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {jhas === null ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : jhas.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noJhas")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {jhas.map((item) => {
            const acknowledgedIds = new Set(item.acknowledgments.map((a) => a.worker.id));
            const unacknowledged = workers.filter((w) => !acknowledgedIds.has(w.id));
            return (
              <li key={item.id} className="card">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{item.taskDescription}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(new Date(item.date))}</span>
                </div>
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-700 dark:text-gray-200">{t("hazards")}:</span> {item.hazards}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-700 dark:text-gray-200">{t("controlMeasures")}:</span> {item.controlMeasures}
                </p>
                {item.requiredPpe && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-700 dark:text-gray-200">{t("requiredPpe")}:</span> {item.requiredPpe}
                  </p>
                )}
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {t("acknowledgedCount", { count: item.acknowledgments.length })}
                  {item.acknowledgments.length > 0 && ": " + item.acknowledgments.map((a) => a.worker.name).join(", ")}
                </p>
                {unacknowledged.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {unacknowledged.map((w) => (
                      <button
                        key={w.id}
                        onClick={() => acknowledgeJha(item.id, w.id)}
                        className="btn-secondary px-2 py-0.5 text-xs"
                      >
                        {t("acknowledgeFor", { name: w.name })}
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{item.conductedByName}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
