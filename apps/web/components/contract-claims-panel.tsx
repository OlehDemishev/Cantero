"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CONTRACT_CLAIM_TYPES, type ContractClaimStatus, type ContractClaimType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatDate } from "@/lib/format-date";

interface ContractClaim {
  id: string;
  type: ContractClaimType;
  title: string;
  description: string | null;
  noticeDate: string;
  requestedAmount: string | null;
  requestedDays: number | null;
  status: ContractClaimStatus;
  resolution: string | null;
  resolvedAt: string | null;
}
interface ClaimEvent {
  id: string;
  description: string;
  occurredAt: string;
  createdByName: string;
}
interface ClaimDetail extends ContractClaim {
  events: ClaimEvent[];
}

const STATUS_STYLES: Record<ContractClaimStatus, string> = {
  notice_given: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
  submitted: "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500",
  negotiating: "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400",
  resolved: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
  rejected: "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500",
};
const OPEN_STATUSES: ContractClaimStatus[] = ["notice_given", "submitted", "negotiating"];

export function ContractClaimsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("contractClaims");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [claims, setClaims] = useState<ContractClaim[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClaimDetail | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ type: "delay" as ContractClaimType, title: "", description: "", noticeDate: "", requestedAmount: "", requestedDays: "" });
  const [eventText, setEventText] = useState("");
  const [resolutionText, setResolutionText] = useState("");
  const [resolving, setResolving] = useState(false);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<ContractClaim[]>(`/projects/${projectId}/contract-claims`).then(setClaims);
  }
  useEffect(load, [projectId]);

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      setResolving(false);
      return;
    }
    setExpandedId(id);
    setResolving(false);
    const d = await apiFetch<ClaimDetail>(`/contract-claims/${id}`);
    setDetail(d);
  }

  async function createClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.noticeDate) return;
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/contract-claims`, {
        method: "POST",
        body: JSON.stringify({
          type: form.type,
          title: form.title.trim(),
          description: form.description || undefined,
          noticeDate: new Date(form.noticeDate).toISOString(),
          requestedAmount: form.requestedAmount ? Number(form.requestedAmount) : undefined,
          requestedDays: form.requestedDays ? Number(form.requestedDays) : undefined,
        }),
      });
      setForm({ type: "delay", title: "", description: "", noticeDate: "", requestedAmount: "", requestedDays: "" });
      setAdding(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(id: string, status: ContractClaimStatus) {
    setBusy(true);
    try {
      await apiFetch(`/contract-claims/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      load();
      const d = await apiFetch<ClaimDetail>(`/contract-claims/${id}`);
      setDetail(d);
    } finally {
      setBusy(false);
    }
  }

  async function addEvent(id: string) {
    if (!eventText.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/contract-claims/${id}/events`, { method: "POST", body: JSON.stringify({ description: eventText.trim() }) });
      setEventText("");
      const d = await apiFetch<ClaimDetail>(`/contract-claims/${id}`);
      setDetail(d);
    } finally {
      setBusy(false);
    }
  }

  async function resolveClaim(id: string) {
    if (!resolutionText.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/contract-claims/${id}/resolve`, { method: "POST", body: JSON.stringify({ resolution: resolutionText.trim() }) });
      setResolutionText("");
      setResolving(false);
      load();
      const d = await apiFetch<ClaimDetail>(`/contract-claims/${id}`);
      setDetail(d);
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
            {t("fileClaim")}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      {adding && (
        <form onSubmit={createClaim} className="card mb-3 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <select className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ContractClaimType }))}>
              {CONTRACT_CLAIM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`type_${type}`)}
                </option>
              ))}
            </select>
            <input
              required
              placeholder={t("titlePlaceholder")}
              className="input flex-1"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <textarea
            placeholder={t("descriptionPlaceholder")}
            className="input"
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("noticeDate")}
              <input
                required
                type="date"
                className="input"
                value={form.noticeDate}
                onChange={(e) => setForm((f) => ({ ...f, noticeDate: e.target.value }))}
              />
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder={t("requestedAmountPlaceholder", { currency })}
              className="input w-40"
              value={form.requestedAmount}
              onChange={(e) => setForm((f) => ({ ...f, requestedAmount: e.target.value }))}
            />
            <input
              type="number"
              min="0"
              placeholder={t("requestedDaysPlaceholder")}
              className="input w-32"
              value={form.requestedDays}
              onChange={(e) => setForm((f) => ({ ...f, requestedDays: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {!claims ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      ) : claims.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noClaims")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {claims.map((claim) => {
            const expanded = expandedId === claim.id;
            return (
              <li key={claim.id} className="card">
                <button onClick={() => toggleExpand(claim.id)} className="flex w-full items-center justify-between text-left">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                    {t(`type_${claim.type}`)} · {claim.title}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[claim.status]}`}>{t(`status_${claim.status}`)}</span>
                </button>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  {t("noticeDate")}: {formatDate(new Date(claim.noticeDate))}
                  {claim.requestedAmount && ` · ${claim.requestedAmount} ${currency}`}
                  {claim.requestedDays && ` · ${t("requestedDaysAbbr", { days: claim.requestedDays })}`}
                </p>

                {expanded && detail && detail.id === claim.id && (
                  <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                    {detail.description && <p className="text-sm text-gray-600 dark:text-gray-300">{detail.description}</p>}

                    {OPEN_STATUSES.includes(claim.status) && (
                      <div className="flex flex-wrap gap-1.5">
                        {OPEN_STATUSES.filter((s) => s !== claim.status).map((s) => (
                          <button key={s} onClick={() => updateStatus(claim.id, s)} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                            {t(`moveTo_${s}`)}
                          </button>
                        ))}
                        <button onClick={() => updateStatus(claim.id, "rejected")} disabled={busy} className="text-xs text-error-700 dark:text-error-500 hover:underline">
                          {t("rejectClaim")}
                        </button>
                      </div>
                    )}

                    {claim.status === "resolved" ? (
                      <p className="text-sm text-success-700 dark:text-success-500">
                        {t("resolution")}: {claim.resolution}
                      </p>
                    ) : (
                      OPEN_STATUSES.includes(claim.status) && (
                        <div>
                          {!resolving ? (
                            <button onClick={() => setResolving(true)} className="btn-secondary px-2.5 py-1 text-xs">
                              {t("resolveClaim")}
                            </button>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <input
                                placeholder={t("resolutionPlaceholder")}
                                className="input flex-1"
                                value={resolutionText}
                                onChange={(e) => setResolutionText(e.target.value)}
                              />
                              <button onClick={() => resolveClaim(claim.id)} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">
                                {tc("save")}
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    )}

                    <div>
                      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("timeline")}</h3>
                      <ul className="mb-2 flex flex-col gap-1.5">
                        {detail.events.map((ev) => (
                          <li key={ev.id} className="text-xs">
                            <span className="text-gray-400 dark:text-gray-500">{formatDate(new Date(ev.occurredAt))}</span> — {ev.description}
                            <span className="text-gray-400 dark:text-gray-500"> ({ev.createdByName})</span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex gap-2">
                        <input
                          placeholder={t("eventPlaceholder")}
                          className="input flex-1"
                          value={eventText}
                          onChange={(e) => setEventText(e.target.value)}
                        />
                        <button onClick={() => addEvent(claim.id)} disabled={busy} className="btn-secondary shrink-0 px-2.5 py-1 text-xs">
                          {t("addEvent")}
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
