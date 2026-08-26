"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { INCIDENT_SEVERITIES, OSHA_CASE_TYPES, type IncidentSeverity, type OshaCaseType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { PhotoAttachments } from "@/components/photo-attachments";
import { TemplatePicker } from "@/components/template-picker";

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

const SEVERITY_STYLES: Record<IncidentSeverity, string> = {
  near_miss: "bg-gray-100 text-gray-600",
  first_aid: "bg-brand-50 text-brand-700",
  medical_treatment: "bg-warning-50 text-warning-700",
  lost_time_injury: "bg-error-50 text-error-700",
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

export function SafetyPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("safety");
  const tc = useTranslations("common");

  const [incidents, setIncidents] = useState<IncidentReport[] | null>(null);
  const [briefings, setBriefings] = useState<SafetyBriefing[] | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [creatingIncident, setCreatingIncident] = useState(false);
  const [quickNearMiss, setQuickNearMiss] = useState(false);
  const [creatingBriefing, setCreatingBriefing] = useState(false);
  const [incidentForm, setIncidentForm] = useState(EMPTY_INCIDENT_FORM);
  const [briefingForm, setBriefingForm] = useState(EMPTY_BRIEFING_FORM);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<IncidentReport[]>(`/safety/incidents?projectId=${projectId}`).then(setIncidents);
    apiFetch<SafetyBriefing[]>(`/safety/briefings?projectId=${projectId}`).then(setBriefings);
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

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("title")}</h2>

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("incidents")}</h3>
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
          {quickNearMiss && <p className="text-xs text-gray-500">{t("quickNearMissHint")}</p>}
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("occurredAt")}</span>
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
                <span className="font-medium text-gray-700">{t("severity")}</span>
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
              <span className="font-medium text-gray-700">{t("location")}</span>
              <input
                className="input"
                value={incidentForm.location}
                onChange={(e) => setIncidentForm((f) => ({ ...f, location: e.target.value }))}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("description")}</span>
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
                <span className="font-medium text-gray-700">{t("involvedPersons")}</span>
                <input
                  className="input"
                  placeholder={t("involvedPersonsPlaceholder")}
                  value={incidentForm.involvedPersons}
                  onChange={(e) => setIncidentForm((f) => ({ ...f, involvedPersons: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700">{t("correctiveActions")}</span>
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
                <span className="font-medium text-gray-700">{t("oshaRecordable")}</span>
              </label>
              {incidentForm.oshaRecordable && (
                <div className="flex flex-wrap gap-3 rounded-lg border border-gray-100 p-3">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-gray-700">{t("oshaCaseType")}</span>
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
                    <span className="font-medium text-gray-700">{t("daysAwayFromWork")}</span>
                    <input
                      type="number"
                      min="0"
                      className="input w-28"
                      value={incidentForm.daysAwayFromWork}
                      onChange={(e) => setIncidentForm((f) => ({ ...f, daysAwayFromWork: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-gray-700">{t("daysJobTransferOrRestriction")}</span>
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
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : incidents.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noIncidents")}</p>
      ) : (
        <ul className="mb-6 flex flex-col gap-2">
          {incidents.map((item) => (
            <li key={item.id} className="card">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[item.severity]}`}>
                  {t(`severity_${item.severity}`)}
                </span>
                <span className="text-xs text-gray-500">{new Date(item.occurredAt).toLocaleDateString()}</span>
                {item.location && <span className="text-xs text-gray-500">· {item.location}</span>}
                {item.oshaRecordable && (
                  <span className="rounded-full bg-error-50 px-2 py-0.5 text-xs font-medium text-error-700">
                    {t("oshaRecordable")}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm text-gray-900">{item.description}</p>
              {item.oshaRecordable && (item.oshaCaseType || item.daysAwayFromWork || item.daysJobTransferOrRestriction) && (
                <p className="mt-1 text-xs text-gray-500">
                  {item.oshaCaseType && t(`oshaCaseType_${item.oshaCaseType}`)}
                  {item.daysAwayFromWork ? ` · ${t("daysAwayFromWork")}: ${item.daysAwayFromWork}` : ""}
                  {item.daysJobTransferOrRestriction
                    ? ` · ${t("daysJobTransferOrRestriction")}: ${item.daysJobTransferOrRestriction}`
                    : ""}
                </p>
              )}
              {item.involvedPersons && (
                <p className="mt-1 text-xs text-gray-500">
                  {t("involvedPersons")}: {item.involvedPersons}
                </p>
              )}
              {item.correctiveActions && (
                <p className="mt-1 text-xs text-gray-500">
                  {t("correctiveActions")}: {item.correctiveActions}
                </p>
              )}
              <div className="mt-2">
                <PhotoAttachments param="incidentReportId" entityId={item.id} />
              </div>
              <p className="mt-1 text-xs text-gray-400">{item.reportedByName}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("briefings")}</h3>
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
            onSelect={(subject, body) => setBriefingForm((f) => ({ ...f, topic: subject, notes: body }))}
          />
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("topic")}</span>
              <input
                required
                className="input"
                placeholder={t("topicPlaceholder")}
                value={briefingForm.topic}
                onChange={(e) => setBriefingForm((f) => ({ ...f, topic: e.target.value }))}
              />
            </label>
            <label className="flex w-40 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("date")}</span>
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
            <span className="font-medium text-gray-700">{t("notes")}</span>
            <textarea
              rows={2}
              className="input"
              value={briefingForm.notes}
              onChange={(e) => setBriefingForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("attendees")}</span>
            <div className="flex flex-wrap gap-2">
              {workers.map((w) => (
                <label
                  key={w.id}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${
                    briefingForm.attendeeWorkerIds.includes(w.id)
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-gray-200 text-gray-600"
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
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : briefings.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noBriefings")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {briefings.map((item) => (
            <li key={item.id} className="card">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">{item.topic}</span>
                <span className="text-xs text-gray-500">{new Date(item.date).toLocaleDateString()}</span>
              </div>
              {item.notes && <p className="mt-1 text-xs text-gray-500">{item.notes}</p>}
              <p className="mt-1.5 text-xs text-gray-500">
                {t("attendeeCount", { count: item.attendees.length })}
                {item.attendees.length > 0 && ": " + item.attendees.map((a) => a.worker.name).join(", ")}
              </p>
              <p className="mt-1 text-xs text-gray-400">{item.conductedByName}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
