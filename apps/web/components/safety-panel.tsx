"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { INCIDENT_SEVERITIES, OSHA_CASE_TYPES, type IncidentSeverity, type OshaCaseType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PhotoAttachments } from "@/components/photo-attachments";
import { TemplatePicker } from "@/components/template-picker";
import { PrintButton } from "@/components/ui/print-button";
import { formatDate } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/status-tone";
import { Field } from "@/components/ui/field";

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

  const { data: incidents = null, reload: reloadIncidents, error: incidentsError } = useApi<IncidentReport[]>(`/safety/incidents?projectId=${projectId}`);
  const { data: briefings = null, reload: reloadBriefings, error: briefingsError } = useApi<SafetyBriefing[]>(`/safety/briefings?projectId=${projectId}`);
  const { data: jhas = null, reload: reloadJhas, error: jhasError } = useApi<Jha[]>(`/safety/jha?projectId=${projectId}`);
  const { data: workers = [] } = useApi<Worker[]>("/workers");
  const [creatingIncident, setCreatingIncident] = useState(false);
  const [quickNearMiss, setQuickNearMiss] = useState(false);
  const [creatingBriefing, setCreatingBriefing] = useState(false);
  const [creatingJha, setCreatingJha] = useState(false);
  const [incidentForm, setIncidentForm] = useState(EMPTY_INCIDENT_FORM);
  const [briefingForm, setBriefingForm] = useState(EMPTY_BRIEFING_FORM);
  const [jhaForm, setJhaForm] = useState(EMPTY_JHA_FORM);
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadIncidents();
    void reloadBriefings();
    void reloadJhas();
  }

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
        <h2 className="text-sm font-semibold text-fg-muted">{t("title")}</h2>
        <PrintButton />
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("incidents")}</h3>
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
          {quickNearMiss && <p className="text-xs text-fg-subtle">{t("quickNearMissHint")}</p>}
          <div className="flex flex-wrap gap-3">
            <Field label={t("occurredAt")}>
              <input
                type="date"
                required
                className="input"
                value={incidentForm.occurredAt}
                onChange={(e) => setIncidentForm((f) => ({ ...f, occurredAt: e.target.value }))}
              />
            </Field>
            {!quickNearMiss && (
              <Field label={t("severity")}>
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
              </Field>
            )}
            <Field label={t("location")}>
              <input
                className="input"
                value={incidentForm.location}
                onChange={(e) => setIncidentForm((f) => ({ ...f, location: e.target.value }))}
              />
            </Field>
          </div>
          <Field label={t("description")}>
            <textarea
              required
              rows={2}
              className="input"
              value={incidentForm.description}
              onChange={(e) => setIncidentForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>
          {!quickNearMiss && (
            <>
              <Field label={t("involvedPersons")}>
                <input
                  className="input"
                  placeholder={t("involvedPersonsPlaceholder")}
                  value={incidentForm.involvedPersons}
                  onChange={(e) => setIncidentForm((f) => ({ ...f, involvedPersons: e.target.value }))}
                />
              </Field>
              <Field label={t("correctiveActions")}>
                <textarea
                  rows={2}
                  className="input"
                  value={incidentForm.correctiveActions}
                  onChange={(e) => setIncidentForm((f) => ({ ...f, correctiveActions: e.target.value }))}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={incidentForm.oshaRecordable}
                  onChange={(e) => setIncidentForm((f) => ({ ...f, oshaRecordable: e.target.checked }))}
                />
                <span className="font-medium text-fg-muted">{t("oshaRecordable")}</span>
              </label>
              {incidentForm.oshaRecordable && (
                <div className="flex flex-wrap gap-3 rounded-lg border border-gray-100 dark:border-gray-700 p-3">
                  <Field label={t("oshaCaseType")}>
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
                  </Field>
                  <Field label={t("daysAwayFromWork")}>
                    <input
                      type="number"
                      min="0"
                      className="input w-28"
                      value={incidentForm.daysAwayFromWork}
                      onChange={(e) => setIncidentForm((f) => ({ ...f, daysAwayFromWork: e.target.value }))}
                    />
                  </Field>
                  <Field label={t("daysJobTransferOrRestriction")}>
                    <input
                      type="number"
                      min="0"
                      className="input w-28"
                      value={incidentForm.daysJobTransferOrRestriction}
                      onChange={(e) => setIncidentForm((f) => ({ ...f, daysJobTransferOrRestriction: e.target.value }))}
                    />
                  </Field>
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
        incidentsError ? <ErrorState error={incidentsError} onRetry={reloadIncidents} compact /> : <Skeleton lines={3} />
      ) : incidents.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noIncidents")}</p>
      ) : (
        <ul className="mb-6 flex flex-col gap-2">
          {incidents.map((item) => (
            <li key={item.id} className="card">
              <div className="flex items-center gap-2">
                <Badge tone={statusTone(item.severity)}>
                  {t(`severity_${item.severity}`)}
                </Badge>
                <span className="text-xs text-fg-subtle">{formatDate(new Date(item.occurredAt))}</span>
                {item.location && <span className="text-xs text-fg-subtle">· {item.location}</span>}
                {item.oshaRecordable && (
                  <Badge tone="danger">
                    {t("oshaRecordable")}
                  </Badge>
                )}
              </div>
              <p className="mt-1.5 text-sm text-fg">{item.description}</p>
              {item.oshaRecordable && (item.oshaCaseType || item.daysAwayFromWork || item.daysJobTransferOrRestriction) && (
                <p className="mt-1 text-xs text-fg-subtle">
                  {item.oshaCaseType && t(`oshaCaseType_${item.oshaCaseType}`)}
                  {item.daysAwayFromWork ? ` · ${t("daysAwayFromWork")}: ${item.daysAwayFromWork}` : ""}
                  {item.daysJobTransferOrRestriction
                    ? ` · ${t("daysJobTransferOrRestriction")}: ${item.daysJobTransferOrRestriction}`
                    : ""}
                </p>
              )}
              {item.involvedPersons && (
                <p className="mt-1 text-xs text-fg-subtle">
                  {t("involvedPersons")}: {item.involvedPersons}
                </p>
              )}
              {item.correctiveActions && (
                <p className="mt-1 text-xs text-fg-subtle">
                  {t("correctiveActions")}: {item.correctiveActions}
                </p>
              )}
              <div className="mt-2">
                <PhotoAttachments param="incidentReportId" entityId={item.id} />
              </div>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-xs text-fg-subtle">{item.reportedByName}</p>
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
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("briefings")}</h3>
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
            <Field label={t("topic")} className="flex-1">
              <input
                required
                className="input"
                placeholder={t("topicPlaceholder")}
                value={briefingForm.topic}
                onChange={(e) => setBriefingForm((f) => ({ ...f, topic: e.target.value }))}
              />
            </Field>
            <Field label={t("date")} className="w-40">
              <input
                type="date"
                required
                className="input"
                value={briefingForm.date}
                onChange={(e) => setBriefingForm((f) => ({ ...f, date: e.target.value }))}
              />
            </Field>
          </div>
          <Field label={t("notes")}>
            <textarea
              rows={2}
              className="input"
              value={briefingForm.notes}
              onChange={(e) => setBriefingForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </Field>
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-fg-muted">{t("attendees")}</span>
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
        briefingsError ? <ErrorState error={briefingsError} onRetry={reloadBriefings} compact /> : <Skeleton lines={3} />
      ) : briefings.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noBriefings")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {briefings.map((item) => (
            <li key={item.id} className="card">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-fg">{item.topic}</span>
                <span className="text-xs text-fg-subtle">{formatDate(new Date(item.date))}</span>
              </div>
              {item.notes && <p className="mt-1 text-xs text-fg-subtle">{item.notes}</p>}
              <p className="mt-1.5 text-xs text-fg-subtle">
                {t("attendeeCount", { count: item.attendees.length })}
                {item.attendees.length > 0 && ": " + item.attendees.map((a) => a.worker.name).join(", ")}
              </p>
              <p className="mt-1 text-xs text-fg-subtle">{item.conductedByName}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="mb-2 mt-6 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("jhaTitle")}</h3>
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
            <Field label={t("taskDescription")} className="flex-1">
              <input
                required
                className="input"
                placeholder={t("taskDescriptionPlaceholder")}
                value={jhaForm.taskDescription}
                onChange={(e) => setJhaForm((f) => ({ ...f, taskDescription: e.target.value }))}
              />
            </Field>
            <Field label={t("date")} className="w-40">
              <input
                type="date"
                required
                className="input"
                value={jhaForm.date}
                onChange={(e) => setJhaForm((f) => ({ ...f, date: e.target.value }))}
              />
            </Field>
          </div>
          <Field label={t("hazards")}>
            <textarea
              required
              rows={2}
              className="input"
              placeholder={t("hazardsPlaceholder")}
              value={jhaForm.hazards}
              onChange={(e) => setJhaForm((f) => ({ ...f, hazards: e.target.value }))}
            />
          </Field>
          <Field label={t("controlMeasures")}>
            <textarea
              required
              rows={2}
              className="input"
              placeholder={t("controlMeasuresPlaceholder")}
              value={jhaForm.controlMeasures}
              onChange={(e) => setJhaForm((f) => ({ ...f, controlMeasures: e.target.value }))}
            />
          </Field>
          <Field label={t("requiredPpe")}>
            <input
              className="input"
              placeholder={t("requiredPpePlaceholder")}
              value={jhaForm.requiredPpe}
              onChange={(e) => setJhaForm((f) => ({ ...f, requiredPpe: e.target.value }))}
            />
          </Field>
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-fg-muted">{t("acknowledgedBy")}</span>
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
        jhasError ? <ErrorState error={jhasError} onRetry={reloadJhas} compact /> : <Skeleton lines={3} />
      ) : jhas.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noJhas")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {jhas.map((item) => {
            const acknowledgedIds = new Set(item.acknowledgments.map((a) => a.worker.id));
            const unacknowledged = workers.filter((w) => !acknowledgedIds.has(w.id));
            return (
              <li key={item.id} className="card">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-fg">{item.taskDescription}</span>
                  <span className="text-xs text-fg-subtle">{formatDate(new Date(item.date))}</span>
                </div>
                <p className="mt-1.5 text-xs text-fg-subtle">
                  <span className="font-medium text-fg-muted">{t("hazards")}:</span> {item.hazards}
                </p>
                <p className="mt-1 text-xs text-fg-subtle">
                  <span className="font-medium text-fg-muted">{t("controlMeasures")}:</span> {item.controlMeasures}
                </p>
                {item.requiredPpe && (
                  <p className="mt-1 text-xs text-fg-subtle">
                    <span className="font-medium text-fg-muted">{t("requiredPpe")}:</span> {item.requiredPpe}
                  </p>
                )}
                <p className="mt-1.5 text-xs text-fg-subtle">
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
                <p className="mt-1 text-xs text-fg-subtle">{item.conductedByName}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
