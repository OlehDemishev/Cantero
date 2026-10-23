"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ENVIRONMENTAL_INCIDENT_SEVERITIES,
  type BmpInspectionResult,
  type EnvironmentalIncidentSeverity,
  type EnvironmentalIncidentStatus,
} from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/status-tone";
import { Field } from "@/components/ui/field";

interface BmpInspection {
  id: string;
  inspectedAt: string;
  triggerReason: string | null;
  result: BmpInspectionResult;
  inspectorName: string | null;
  correctiveActions: string | null;
}
interface StormwaterPermit {
  id: string;
  permitNumber: string | null;
  noiFiledAt: string | null;
  notFiledAt: string | null;
  active: boolean;
  inspections: BmpInspection[];
}
interface EnvironmentalIncident {
  id: string;
  description: string;
  severity: EnvironmentalIncidentSeverity;
  status: EnvironmentalIncidentStatus;
  occurredAt: string;
  containedAt: string | null;
  regulatorNotified: boolean;
}

const OPEN_INCIDENT_STATUSES: EnvironmentalIncidentStatus[] = ["open", "contained"];

export function EnvironmentalPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("environmental");
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");

  const { data: permits = null, reload: reloadPermits, error: permitsError } = useApi<StormwaterPermit[]>(`/projects/${projectId}/stormwater-permits`);
  const { data: incidents = null, reload: reloadIncidents, error: incidentsError } = useApi<EnvironmentalIncident[]>(`/projects/${projectId}/environmental-incidents`);
  const [addingPermit, setAddingPermit] = useState(false);
  const [permitForm, setPermitForm] = useState({ permitNumber: "", noiFiledAt: "" });
  const [inspectingPermitId, setInspectingPermitId] = useState<string | null>(null);
  const [inspectionForm, setInspectionForm] = useState({ triggerReason: "", result: "satisfactory" as BmpInspectionResult, inspectorName: "", correctiveActions: "" });
  const [addingIncident, setAddingIncident] = useState(false);
  const [incidentForm, setIncidentForm] = useState({ description: "", severity: "minor" as EnvironmentalIncidentSeverity, regulatorNotified: false });
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadPermits();
    void reloadIncidents();
  }

  async function createPermit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/stormwater-permits`, {
        method: "POST",
        body: JSON.stringify({
          permitNumber: permitForm.permitNumber || undefined,
          noiFiledAt: permitForm.noiFiledAt ? new Date(permitForm.noiFiledAt).toISOString() : undefined,
        }),
      });
      setPermitForm({ permitNumber: "", noiFiledAt: "" });
      setAddingPermit(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function fileNot(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/stormwater-permits/${id}/file-not`, {
        method: "POST",
        body: JSON.stringify({ notFiledAt: new Date().toISOString() }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function addInspection(permitId: string) {
    setBusy(true);
    try {
      await apiFetch(`/stormwater-permits/${permitId}/inspections`, {
        method: "POST",
        body: JSON.stringify({
          triggerReason: inspectionForm.triggerReason || undefined,
          result: inspectionForm.result,
          inspectorName: inspectionForm.inspectorName || undefined,
          correctiveActions: inspectionForm.correctiveActions || undefined,
        }),
      });
      setInspectionForm({ triggerReason: "", result: "satisfactory", inspectorName: "", correctiveActions: "" });
      setInspectingPermitId(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function reportIncident(e: React.FormEvent) {
    e.preventDefault();
    if (!incidentForm.description.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/environmental-incidents`, {
        method: "POST",
        body: JSON.stringify({
          description: incidentForm.description.trim(),
          severity: incidentForm.severity,
          regulatorNotified: incidentForm.regulatorNotified,
        }),
      });
      setIncidentForm({ description: "", severity: "minor", regulatorNotified: false });
      setAddingIncident(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function updateIncidentStatus(id: string, status: EnvironmentalIncidentStatus) {
    setBusy(true);
    try {
      await apiFetch(`/environmental-incidents/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg-muted">{t("title")}</h2>
        {!addingPermit && (
          <button onClick={() => setAddingPermit(true)} className="btn-secondary px-2.5 py-1 text-xs">
            {t("addPermit")}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-fg-subtle">{t("hint")}</p>

      {addingPermit && (
        <form onSubmit={createPermit} className="card mb-3 flex flex-wrap items-end gap-2">
          <input
            placeholder={t("permitNumberPlaceholder")} aria-label={t("permitNumberPlaceholder")}
            className="input"
            value={permitForm.permitNumber}
            onChange={(e) => setPermitForm((f) => ({ ...f, permitNumber: e.target.value }))}
          />
          <Field label={t("noiFiledAt")} size="sm">
            <input type="date" className="input" value={permitForm.noiFiledAt} onChange={(e) => setPermitForm((f) => ({ ...f, noiFiledAt: e.target.value }))} />
          </Field>
          <button type="submit" disabled={busy} className="btn-primary">
            {tc("save")}
          </button>
          <button type="button" onClick={() => setAddingPermit(false)} className="btn-secondary">
            {tc("cancel")}
          </button>
        </form>
      )}

      {!permits ? (
        permitsError ? <ErrorState error={permitsError} onRetry={reloadPermits} compact /> : <Skeleton lines={3} />
      ) : permits.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noPermits")}</p>
      ) : (
        <ul className="mb-6 flex flex-col gap-2">
          {permits.map((p) => (
            <li key={p.id} className="card">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-fg">{p.permitNumber ?? t("permitNumberPlaceholder")}</span>
                <Badge tone={p.active ? "success" : "neutral"}>
                  {p.active ? t("active") : t("inactive")}
                </Badge>
              </div>
              {p.noiFiledAt && <p className="mt-1 text-xs text-fg-subtle">{t("noiFiledAt")}: {formatDate(new Date(p.noiFiledAt))}</p>}

              {p.inspections.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {p.inspections.map((insp) => (
                    <li key={insp.id} className="text-xs text-fg-subtle">
                      <span className="text-fg-subtle">{formatDate(new Date(insp.inspectedAt))}</span> —{" "}
                      <span className={insp.result === "deficient" ? "font-medium text-danger-fg" : ""}>{t(`result_${insp.result}`)}</span>
                      {insp.inspectorName && ` (${insp.inspectorName})`}
                    </li>
                  ))}
                </ul>
              )}

              {p.active && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  {inspectingPermitId === p.id ? (
                    <>
                      <input
                        placeholder={t("triggerReasonPlaceholder")} aria-label={t("triggerReasonPlaceholder")}
                        className="input"
                        value={inspectionForm.triggerReason}
                        onChange={(e) => setInspectionForm((f) => ({ ...f, triggerReason: e.target.value }))}
                      />
                      <select aria-label={ta("result")}
                        className="input"
                        value={inspectionForm.result}
                        onChange={(e) => setInspectionForm((f) => ({ ...f, result: e.target.value as BmpInspectionResult }))}
                      >
                        <option value="satisfactory">{t("result_satisfactory")}</option>
                        <option value="deficient">{t("result_deficient")}</option>
                      </select>
                      <input
                        placeholder={t("inspectorNamePlaceholder")} aria-label={t("inspectorNamePlaceholder")}
                        className="input"
                        value={inspectionForm.inspectorName}
                        onChange={(e) => setInspectionForm((f) => ({ ...f, inspectorName: e.target.value }))}
                      />
                      <button onClick={() => addInspection(p.id)} disabled={busy} className="btn-primary px-2.5 py-1 text-xs">
                        {tc("save")}
                      </button>
                      <button onClick={() => setInspectingPermitId(null)} className="btn-secondary px-2.5 py-1 text-xs">
                        {tc("cancel")}
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setInspectingPermitId(p.id)} className="btn-secondary px-2.5 py-1 text-xs">
                        {t("addInspection")}
                      </button>
                      <button onClick={() => fileNot(p.id)} disabled={busy} className="text-xs text-fg-subtle hover:underline">
                        {t("fileNot")}
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg-muted">{t("incidentsTitle")}</h3>
        {!addingIncident && (
          <button onClick={() => setAddingIncident(true)} className="btn-secondary px-2.5 py-1 text-xs">
            {t("reportIncident")}
          </button>
        )}
      </div>

      {addingIncident && (
        <form onSubmit={reportIncident} className="card mb-3 flex flex-col gap-2">
          <textarea
            required
            placeholder={t("descriptionPlaceholder")} aria-label={t("descriptionPlaceholder")}
            className="input"
            rows={2}
            value={incidentForm.description}
            onChange={(e) => setIncidentForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label={ta("severity")}
              className="input"
              value={incidentForm.severity}
              onChange={(e) => setIncidentForm((f) => ({ ...f, severity: e.target.value as EnvironmentalIncidentSeverity }))}
            >
              {ENVIRONMENTAL_INCIDENT_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {t(`severity_${s}`)}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={incidentForm.regulatorNotified}
                onChange={(e) => setIncidentForm((f) => ({ ...f, regulatorNotified: e.target.checked }))}
              />
              {t("regulatorNotifiedLabel")}
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setAddingIncident(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {!incidents ? (
        incidentsError ? <ErrorState error={incidentsError} onRetry={reloadIncidents} compact /> : <Skeleton lines={3} />
      ) : incidents.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noIncidents")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {incidents.map((inc) => (
            <li key={inc.id} className="card">
              <div className="flex items-center justify-between">
                <span className="text-sm text-fg">{inc.description}</span>
                <Badge tone={statusTone(inc.severity, "environmental")}>{t(`severity_${inc.severity}`)}</Badge>
              </div>
              <p className="mt-1 text-xs text-fg-subtle">
                {formatDate(new Date(inc.occurredAt))} · {t(`status_${inc.status}`)}
                {inc.regulatorNotified && ` · ${t("regulatorNotifiedLabel")}`}
              </p>
              {OPEN_INCIDENT_STATUSES.includes(inc.status) && (
                <div className="mt-2 flex gap-2">
                  {inc.status === "open" && (
                    <button onClick={() => updateIncidentStatus(inc.id, "contained")} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                      {t("moveTo_contained")}
                    </button>
                  )}
                  <button onClick={() => updateIncidentStatus(inc.id, "resolved")} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                    {t("moveTo_resolved")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
