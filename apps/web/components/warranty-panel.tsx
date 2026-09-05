"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { BulkActionResult, WarrantyClaimStatus } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { PhotoAttachments } from "@/components/photo-attachments";
import { useBulkSelection } from "@/components/bulk-select";
import { formatDate } from "@/lib/format-date";

interface Worker {
  id: string;
  name: string;
}
interface WarrantyRecovery {
  recoveredAmount: number;
  pendingAmount: number;
  recoveryPercent: number | null;
}
interface WarrantyClaim {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  status: WarrantyClaimStatus;
  submittedByName: string;
  submittedByClientId: string | null;
  assignee: Worker | null;
  resolutionNotes: string | null;
  repairCost: string | null;
  denialReason: string | null;
  recovery: WarrantyRecovery;
}
interface Project {
  handoverDate: string | null;
  warrantyMonths: number | null;
}

const STATUS_STYLES: Record<WarrantyClaimStatus, string> = {
  open: "bg-gray-100 text-gray-600",
  in_progress: "bg-brand-50 text-brand-700",
  resolved: "bg-success-50 text-success-700",
  denied: "bg-error-50 text-error-700",
};

function warrantyExpiresAt(handoverDate: string | null, warrantyMonths: number | null): Date | null {
  if (!handoverDate || !warrantyMonths) return null;
  const d = new Date(handoverDate);
  d.setMonth(d.getMonth() + warrantyMonths);
  return d;
}

export function WarrantyPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("warranty");
  const tc = useTranslations("common");
  const tb = useTranslations("bulk");
  const bulk = useBulkSelection();

  const [project, setProject] = useState<Project | null>(null);
  const [claims, setClaims] = useState<WarrantyClaim[] | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [warrantyForm, setWarrantyForm] = useState({ handoverDate: "", warrantyMonths: "" });
  const [creating, setCreating] = useState(false);
  const [claimForm, setClaimForm] = useState({ title: "", description: "", location: "", assigneeWorkerId: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [repairCost, setRepairCost] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Project>(`/projects/${projectId}`).then((p) => {
      setProject(p);
      setWarrantyForm({
        handoverDate: p.handoverDate ? p.handoverDate.slice(0, 10) : "",
        warrantyMonths: p.warrantyMonths?.toString() ?? "",
      });
    });
    apiFetch<WarrantyClaim[]>(`/warranty-claims?projectId=${projectId}`).then(setClaims);
  }

  useEffect(() => {
    load();
    apiFetch<Worker[]>("/workers").then(setWorkers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function saveWarranty(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/warranty`, {
        method: "PATCH",
        body: JSON.stringify({
          handoverDate: warrantyForm.handoverDate ? new Date(warrantyForm.handoverDate).toISOString() : null,
          warrantyMonths: warrantyForm.warrantyMonths ? Number(warrantyForm.warrantyMonths) : null,
        }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function submitClaim(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/warranty-claims", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          title: claimForm.title,
          description: claimForm.description || undefined,
          location: claimForm.location || undefined,
          assigneeWorkerId: claimForm.assigneeWorkerId || undefined,
        }),
      });
      setClaimForm({ title: "", description: "", location: "", assigneeWorkerId: "" });
      setCreating(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function start(id: string) {
    await apiFetch(`/warranty-claims/${id}/start`, { method: "POST" });
    load();
  }

  async function resolve(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/warranty-claims/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolutionNotes: resolutionNotes || undefined, repairCost: repairCost ? Number(repairCost) : undefined }),
      });
      setResolutionNotes("");
      setRepairCost("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function deny(id: string) {
    if (!denyReason.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/warranty-claims/${id}/deny`, { method: "POST", body: JSON.stringify({ denialReason: denyReason }) });
      setDenyReason("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function reopen(id: string) {
    await apiFetch(`/warranty-claims/${id}/reopen`, { method: "POST" });
    load();
  }

  async function bulkStart() {
    const ids = Array.from(bulk.selected);
    const result = await apiFetch<BulkActionResult>("/warranty-claims/bulk/start", { method: "POST", body: JSON.stringify({ ids }) });
    bulk.setResult(result);
    bulk.clearSelection();
    load();
  }

  const expiresAt = project ? warrantyExpiresAt(project.handoverDate, project.warrantyMonths) : null;
  const isUnderWarranty = expiresAt !== null && expiresAt > new Date();

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("title")}</h2>

      <form onSubmit={saveWarranty} className="card mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700">{t("handoverDate")}</span>
          <input
            type="date"
            className="input"
            value={warrantyForm.handoverDate}
            onChange={(e) => setWarrantyForm((f) => ({ ...f, handoverDate: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700">{t("warrantyMonths")}</span>
          <input
            type="number"
            min="1"
            max="120"
            className="input w-28"
            value={warrantyForm.warrantyMonths}
            onChange={(e) => setWarrantyForm((f) => ({ ...f, warrantyMonths: e.target.value }))}
          />
        </label>
        <button type="submit" disabled={busy} className="btn-secondary">
          {tc("save")}
        </button>
        {expiresAt && (
          <span className={`text-xs font-medium ${isUnderWarranty ? "text-success-700" : "text-gray-400"}`}>
            {isUnderWarranty ? t("underWarrantyUntil", { date: formatDate(expiresAt) }) : t("warrantyExpiredOn", { date: formatDate(expiresAt) })}
          </span>
        )}
      </form>

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("claims")}</h3>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newClaim")}
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={submitClaim} className="card mb-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("claimTitle")}</span>
            <input
              required
              className="input"
              value={claimForm.title}
              onChange={(e) => setClaimForm((f) => ({ ...f, title: e.target.value }))}
            />
          </label>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("location")}</span>
              <input
                className="input"
                value={claimForm.location}
                onChange={(e) => setClaimForm((f) => ({ ...f, location: e.target.value }))}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("assignee")}</span>
              <select
                className="input"
                value={claimForm.assigneeWorkerId}
                onChange={(e) => setClaimForm((f) => ({ ...f, assigneeWorkerId: e.target.value }))}
              >
                <option value="">{tc("none")}</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("description")}</span>
            <textarea
              rows={2}
              className="input"
              value={claimForm.description}
              onChange={(e) => setClaimForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {bulk.result && (
        <div className="mb-3 flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <span>{tb("resultSummary", { succeeded: bulk.result.succeeded, failed: bulk.result.failed.length })}</span>
          <button onClick={bulk.dismissResult} className="text-gray-400 hover:text-gray-600">
            ×
          </button>
        </div>
      )}

      {claims === null ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : claims.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noClaims")}</p>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-3 text-xs text-gray-500">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={bulk.selected.size === claims.length}
                onChange={() => bulk.toggleAll(claims.map((c) => c.id))}
              />
              {tb("selectAll")}
            </label>
            {bulk.selected.size > 0 && (
              <>
                <span>{tb("nSelected", { count: bulk.selected.size })}</span>
                <button onClick={bulkStart} className="btn-secondary px-2.5 py-1 text-xs">
                  {t("bulkStart")}
                </button>
              </>
            )}
          </div>
          <ul className="flex flex-col gap-2">
          {claims.map((claim) => {
            const expanded = expandedId === claim.id;
            return (
              <li key={claim.id} className="card">
                <div className="flex w-full items-start gap-3">
                  <input type="checkbox" className="mt-1" checked={bulk.selected.has(claim.id)} onChange={() => bulk.toggle(claim.id)} />
                  <button
                    onClick={() => {
                      setExpandedId(expanded ? null : claim.id);
                      setDenyReason("");
                      setResolutionNotes("");
                    }}
                    className="flex flex-1 items-start justify-between gap-3 text-left"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{claim.title}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[claim.status]}`}>
                          {t(claim.status)}
                        </span>
                        {claim.submittedByClientId && (
                          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">{t("fromClient")}</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                        {claim.location && <span>{claim.location}</span>}
                        {claim.assignee && <span>{t("assignedTo", { name: claim.assignee.name })}</span>}
                      </div>
                    </div>
                  </button>
                </div>

                {expanded && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 text-sm">
                    {claim.description && <p>{claim.description}</p>}
                    <p className="text-xs text-gray-400">{t("submittedBy", { name: claim.submittedByName })}</p>
                    {claim.resolutionNotes && (
                      <p>
                        <span className="font-medium text-gray-700">{t("resolutionNotes")}: </span>
                        {claim.resolutionNotes}
                      </p>
                    )}
                    {claim.denialReason && (
                      <p>
                        <span className="font-medium text-gray-700">{t("denialReason")}: </span>
                        {claim.denialReason}
                      </p>
                    )}
                    {claim.repairCost !== null && (
                      <div className="rounded-md bg-gray-50 p-2 text-xs text-gray-600">
                        <p>{t("repairCostLabel", { amount: claim.repairCost })}</p>
                        <p>
                          {t("recoveredLabel", { amount: claim.recovery.recoveredAmount })}
                          {claim.recovery.pendingAmount > 0 && ` · ${t("pendingRecoveryLabel", { amount: claim.recovery.pendingAmount })}`}
                          {claim.recovery.recoveryPercent !== null && ` (${claim.recovery.recoveryPercent}%)`}
                        </p>
                      </div>
                    )}

                    <PhotoAttachments param="warrantyClaimId" entityId={claim.id} />

                    {claim.status === "open" && (
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => start(claim.id)} className="btn-secondary px-3 py-1 text-xs">
                          {t("startWork")}
                        </button>
                      </div>
                    )}

                    {(claim.status === "open" || claim.status === "in_progress") && (
                      <div className="flex flex-col gap-2">
                        <textarea
                          rows={2}
                          className="input"
                          placeholder={t("resolutionNotesPlaceholder")}
                          value={resolutionNotes}
                          onChange={(e) => setResolutionNotes(e.target.value)}
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="input w-40"
                          placeholder={t("repairCostPlaceholder")}
                          value={repairCost}
                          onChange={(e) => setRepairCost(e.target.value)}
                        />
                        <button onClick={() => resolve(claim.id)} disabled={busy} className="btn-primary w-fit px-3 py-1 text-xs">
                          {t("markResolved")}
                        </button>
                        <textarea
                          rows={2}
                          className="input"
                          placeholder={t("denialReasonPlaceholder")}
                          value={denyReason}
                          onChange={(e) => setDenyReason(e.target.value)}
                        />
                        <button onClick={() => deny(claim.id)} disabled={busy || !denyReason.trim()} className="btn-secondary w-fit px-3 py-1 text-xs">
                          {t("deny")}
                        </button>
                      </div>
                    )}

                    {(claim.status === "resolved" || claim.status === "denied") && (
                      <button onClick={() => reopen(claim.id)} className="btn-secondary w-fit px-3 py-1 text-xs">
                        {t("reopen")}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          </ul>
        </>
      )}
    </div>
  );
}
