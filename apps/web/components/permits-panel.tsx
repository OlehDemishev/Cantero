"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { InspectionResult, PermitStatus } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format-date";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { statusTone, TONE_TEXT_CLASSES } from "@/lib/status-tone";
import { Field } from "@/components/ui/field";

interface Permit {
  id: string;
  permitType: string;
  permitNumber: string | null;
  authorityName: string | null;
  status: PermitStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
}
interface Inspection {
  id: string;
  inspectionType: string;
  scheduledDate: string | null;
  inspectorName: string | null;
  result: InspectionResult;
  completedAt: string | null;
}

const PERMIT_STATUSES: PermitStatus[] = ["draft", "submitted", "approved", "rejected", "expired"];


export function PermitsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("permits");
  const confirm = useConfirm();
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");

  const { data: permits = null, reload: reloadPermits, error: permitsError } = useApi<Permit[]>(`/projects/${projectId}/permits`);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const {
    data: inspections = null,
    error: inspectionsError,
    reload: reloadInspections,
  } = useApi<Inspection[]>(expandedId ? `/permits/${expandedId}/inspections` : null);
  const [permitForm, setPermitForm] = useState({ permitType: "", permitNumber: "", authorityName: "", expiresAt: "" });
  const [inspectionForm, setInspectionForm] = useState({ inspectionType: "", scheduledDate: "", inspectorName: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadPermits();
  }

  /** After a change to the open permit's inspections. */
  function loadInspections() {
    void reloadInspections();
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
  }

  async function createPermit(e: React.FormEvent) {
    e.preventDefault();
    if (!permitForm.permitType.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/permits`, {
        method: "POST",
        body: JSON.stringify({
          permitType: permitForm.permitType,
          permitNumber: permitForm.permitNumber || undefined,
          authorityName: permitForm.authorityName || undefined,
          expiresAt: permitForm.expiresAt ? new Date(permitForm.expiresAt).toISOString() : undefined,
        }),
      });
      setPermitForm({ permitType: "", permitNumber: "", authorityName: "", expiresAt: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(id: string, status: PermitStatus) {
    setBusy(true);
    try {
      await apiFetch(`/permits/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function deletePermit(id: string) {
    if (!(await confirm({ message: t("confirmDeletePermit"), tone: "danger", verb: "delete" }))) return;
    await apiFetch(`/permits/${id}`, { method: "DELETE" });
    if (expandedId === id) setExpandedId(null);
    load();
  }

  async function createInspection(e: React.FormEvent, permitId: string) {
    e.preventDefault();
    if (!inspectionForm.inspectionType.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/permits/${permitId}/inspections`, {
        method: "POST",
        body: JSON.stringify({
          inspectionType: inspectionForm.inspectionType,
          scheduledDate: inspectionForm.scheduledDate ? new Date(inspectionForm.scheduledDate).toISOString() : undefined,
          inspectorName: inspectionForm.inspectorName || undefined,
        }),
      });
      setInspectionForm({ inspectionType: "", scheduledDate: "", inspectorName: "" });
      loadInspections();
    } finally {
      setBusy(false);
    }
  }

  async function recordResult(permitId: string, inspectionId: string, result: InspectionResult) {
    setBusy(true);
    try {
      await apiFetch(`/permits/${permitId}/inspections/${inspectionId}/result`, { method: "POST", body: JSON.stringify({ result }) });
      loadInspections();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("hint")}</p>

      {!permits ? (
        permitsError ? <ErrorState error={permitsError} onRetry={reloadPermits} compact /> : <Skeleton lines={3} />
      ) : permits.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noPermits")}</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {permits.map((p) => {
            const expanded = expandedId === p.id;
            return (
              <li key={p.id} className="card">
                <button onClick={() => toggleExpand(p.id)} className="flex w-full items-center justify-between text-left">
                  <span className="text-sm font-medium text-fg">
                    {p.permitType} {p.permitNumber && <span className="text-fg-subtle">({p.permitNumber})</span>}
                  </span>
                  <Badge tone={statusTone(p.status)}>{t(`status_${p.status}`)}</Badge>
                </button>

                {expanded && (
                  <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                    <div className="text-xs text-fg-subtle">
                      {p.authorityName && <div>{t("authority")}: {p.authorityName}</div>}
                      {p.expiresAt && <div>{t("expires")}: {formatDate(new Date(p.expiresAt))}</div>}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {PERMIT_STATUSES.map((s) => (
                        <button
                          key={s}
                          onClick={() => updateStatus(p.id, s)}
                          disabled={busy || p.status === s}
                          className={`rounded-md px-2 py-1 text-xs font-medium ${p.status === s ? "bg-brand-600 text-white" : "btn-secondary"}`}
                        >
                          {t(`status_${s}`)}
                        </button>
                      ))}
                      <button onClick={() => deletePermit(p.id)} className="text-xs text-fg-subtle hover:text-danger-fg">
                        {tc("delete")}
                      </button>
                    </div>

                    <div>
                      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("inspections")}</h3>
                      {!inspections ? (
                        inspectionsError ? <ErrorState error={inspectionsError} onRetry={reloadInspections} compact /> : <Skeleton lines={3} />
                      ) : inspections.length === 0 ? (
                        <p className="text-xs text-fg-subtle">{t("noInspections")}</p>
                      ) : (
                        <ul className="mb-2 flex flex-col gap-1.5">
                          {inspections.map((i) => (
                            <li key={i.id} className="flex items-center justify-between text-xs">
                              <span>
                                {i.inspectionType}
                                {i.scheduledDate && <span className="text-fg-subtle"> · {formatDate(new Date(i.scheduledDate))}</span>}
                                {i.inspectorName && <span className="text-fg-subtle"> · {i.inspectorName}</span>}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <span className={TONE_TEXT_CLASSES[statusTone(i.result, "inspectionResult")]}>{t(`result_${i.result}`)}</span>
                                {i.result === "pending" && (
                                  <>
                                    <button onClick={() => recordResult(p.id, i.id, "passed")} className="text-success-fg hover:underline">
                                      {t("result_passed")}
                                    </button>
                                    <button onClick={() => recordResult(p.id, i.id, "failed")} className="text-danger-fg hover:underline">
                                      {t("result_failed")}
                                    </button>
                                  </>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <form onSubmit={(e) => createInspection(e, p.id)} className="flex flex-wrap items-end gap-2">
                        <input
                          required
                          placeholder={t("inspectionTypePlaceholder")} aria-label={t("inspectionTypePlaceholder")}
                          className="input w-auto"
                          value={inspectionForm.inspectionType}
                          onChange={(e) => setInspectionForm((f) => ({ ...f, inspectionType: e.target.value }))}
                        />
                        <input aria-label={ta("scheduledDate")}
                          type="date"
                          className="input w-auto"
                          value={inspectionForm.scheduledDate}
                          onChange={(e) => setInspectionForm((f) => ({ ...f, scheduledDate: e.target.value }))}
                        />
                        <input
                          placeholder={t("inspectorNamePlaceholder")} aria-label={t("inspectorNamePlaceholder")}
                          className="input w-auto"
                          value={inspectionForm.inspectorName}
                          onChange={(e) => setInspectionForm((f) => ({ ...f, inspectorName: e.target.value }))}
                        />
                        <button type="submit" disabled={busy} className="btn-secondary px-2.5 py-1 text-xs">
                          {t("scheduleInspection")}
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={createPermit} className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
        <input
          required
          placeholder={t("permitTypePlaceholder")} aria-label={t("permitTypePlaceholder")}
          className="input"
          value={permitForm.permitType}
          onChange={(e) => setPermitForm((f) => ({ ...f, permitType: e.target.value }))}
        />
        <input
          placeholder={t("permitNumberPlaceholder")} aria-label={t("permitNumberPlaceholder")}
          className="input"
          value={permitForm.permitNumber}
          onChange={(e) => setPermitForm((f) => ({ ...f, permitNumber: e.target.value }))}
        />
        <input
          placeholder={t("authorityPlaceholder")} aria-label={t("authorityPlaceholder")}
          className="input"
          value={permitForm.authorityName}
          onChange={(e) => setPermitForm((f) => ({ ...f, authorityName: e.target.value }))}
        />
        <Field label={t("expires")} size="sm">
          <input
            type="date"
            className="input"
            value={permitForm.expiresAt}
            onChange={(e) => setPermitForm((f) => ({ ...f, expiresAt: e.target.value }))}
          />
        </Field>
        <button type="submit" disabled={busy} className="btn-secondary shrink-0">
          {t("addPermit")}
        </button>
      </form>
    </div>
  );
}
