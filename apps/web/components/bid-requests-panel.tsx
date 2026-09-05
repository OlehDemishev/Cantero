"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface Subcontractor {
  id: string;
  name: string;
}
interface BidScore {
  criterionId: string;
  score: number;
}
interface Bid {
  id: string;
  amount: string;
  notes: string | null;
  isAwarded: boolean;
  submittedAt: string;
  subcontractor: Subcontractor;
  scores?: BidScore[];
  weightedScore?: number | null;
}
interface Invite {
  subcontractor: Subcontractor;
}
interface Criterion {
  id: string;
  label: string;
  weight: number;
}
type BidRequestStatus = "open" | "awarded" | "cancelled";
interface BidRequest {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: BidRequestStatus;
  invites: Invite[];
  bids: Bid[];
}
interface BidRequestDetail extends BidRequest {
  criteria: Criterion[];
}
interface LevelingBid {
  id: string;
  subcontractorId: string;
  subcontractorName: string;
  amount: number;
}
interface LevelingScopeRow {
  description: string;
  byBid: Record<string, { amount: number; included: boolean } | null>;
}
interface Leveling {
  bids: LevelingBid[];
  scopeItems: LevelingScopeRow[];
}

const STATUS_STYLES: Record<BidRequestStatus, string> = {
  open: "bg-brand-50 text-brand-700",
  awarded: "bg-success-50 text-success-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export function BidRequestsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("bidding");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [requests, setRequests] = useState<BidRequest[] | null>(null);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BidRequestDetail | null>(null);
  const [leveling, setLeveling] = useState<Leveling | null>(null);
  const [showLeveling, setShowLeveling] = useState(false);
  const [criterionForm, setCriterionForm] = useState({ label: "", weight: "5" });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", dueDate: "", subcontractorIds: new Set<string>() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<BidRequest[]>(`/bid-requests?projectId=${projectId}`).then(setRequests);
  }

  function loadDetail(id: string) {
    apiFetch<BidRequestDetail>(`/bid-requests/${id}`).then(setDetail);
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      setLeveling(null);
      setShowLeveling(false);
    } else {
      setExpandedId(id);
      loadDetail(id);
      setLeveling(null);
      setShowLeveling(false);
    }
  }

  async function toggleLeveling(bidRequestId: string) {
    if (showLeveling) {
      setShowLeveling(false);
      return;
    }
    setShowLeveling(true);
    if (!leveling) apiFetch<Leveling>(`/bid-requests/${bidRequestId}/leveling`).then(setLeveling);
  }

  useEffect(() => {
    load();
    apiFetch<Subcontractor[]>("/finance/subcontractors").then(setSubcontractors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function toggleSub(id: string) {
    setForm((f) => {
      const next = new Set(f.subcontractorIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...f, subcontractorIds: next };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.subcontractorIds.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/bid-requests", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          title: form.title,
          description: form.description || undefined,
          dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
          subcontractorIds: Array.from(form.subcontractorIds),
        }),
      });
      setForm({ title: "", description: "", dueDate: "", subcontractorIds: new Set() });
      setCreating(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function award(bidRequestId: string, bidId: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/bid-requests/${bidRequestId}/award/${bidId}`, { method: "POST" });
      load();
      loadDetail(bidRequestId);
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(bidRequestId: string) {
    setBusy(true);
    try {
      await apiFetch(`/bid-requests/${bidRequestId}/cancel`, { method: "POST" });
      load();
      loadDetail(bidRequestId);
    } finally {
      setBusy(false);
    }
  }

  async function addCriterion(bidRequestId: string, e: React.FormEvent) {
    e.preventDefault();
    if (!criterionForm.label.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/bid-requests/${bidRequestId}/criteria`, {
        method: "POST",
        body: JSON.stringify({ label: criterionForm.label.trim(), weight: Number(criterionForm.weight) }),
      });
      setCriterionForm({ label: "", weight: "5" });
      loadDetail(bidRequestId);
    } finally {
      setBusy(false);
    }
  }

  async function removeCriterion(bidRequestId: string, criterionId: string) {
    setBusy(true);
    try {
      await apiFetch(`/bid-requests/${bidRequestId}/criteria/${criterionId}`, { method: "DELETE" });
      loadDetail(bidRequestId);
    } finally {
      setBusy(false);
    }
  }

  async function scoreBid(bidRequestId: string, bidId: string, criterionId: string, score: number) {
    await apiFetch(`/bid-requests/${bidRequestId}/bids/${bidId}/score`, {
      method: "POST",
      body: JSON.stringify({ criterionId, score }),
    });
    loadDetail(bidRequestId);
  }

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{t("title")}</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newBidRequest")}
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={submit} className="card mb-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("scopeTitle")}</span>
            <input required className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{tc("description")}</span>
            <textarea
              rows={2}
              className="input"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <label className="flex w-auto flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("dueDate")}</span>
            <input
              type="date"
              className="input"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </label>
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("inviteSubcontractors")}</span>
            {subcontractors.length === 0 ? (
              <p className="text-xs text-gray-400">{t("noSubcontractors")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {subcontractors.map((s) => (
                  <label key={s.id} className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1 text-xs">
                    <input type="checkbox" checked={form.subcontractorIds.has(s.id)} onChange={() => toggleSub(s.id)} />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
          </div>
          {error && <p className="text-xs text-error-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || form.subcontractorIds.size === 0} className="btn-primary">
              {t("sendBidRequest")}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {requests === null ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noBidRequests")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.map((r) => {
            const expanded = expandedId === r.id;
            const d = expanded && detail?.id === r.id ? detail : null;
            const bidsBySubId = Object.fromEntries(r.bids.map((b) => [b.subcontractor.id, b]));
            return (
              <li key={r.id} className="card">
                <button onClick={() => toggleExpand(r.id)} className="flex w-full items-center justify-between text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{r.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}>{t(r.status)}</span>
                  </div>
                  <span className="text-xs text-gray-400">{t("bidCount", { count: r.bids.length, total: r.invites.length })}</span>
                </button>

                {expanded && !d && <p className="mt-3 text-xs text-gray-400">{tc("loading")}</p>}

                {d && (
                  <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 pt-3 text-sm">
                    {d.description && <p className="text-gray-600">{d.description}</p>}
                    {error && <p className="text-xs text-error-600">{error}</p>}

                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("scoringCriteria")}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {d.criteria.map((c) => (
                          <span key={c.id} className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                            {c.label} ({c.weight})
                            <button onClick={() => removeCriterion(r.id, c.id)} className="text-gray-400 hover:text-error-700">
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <form onSubmit={(e) => addCriterion(r.id, e)} className="mt-1.5 flex items-center gap-1.5">
                        <input
                          placeholder={t("criterionLabelPlaceholder")}
                          className="input py-1 text-xs"
                          value={criterionForm.label}
                          onChange={(e) => setCriterionForm((f) => ({ ...f, label: e.target.value }))}
                        />
                        <input
                          type="number"
                          min="1"
                          max="10"
                          className="input w-16 py-1 text-xs"
                          value={criterionForm.weight}
                          onChange={(e) => setCriterionForm((f) => ({ ...f, weight: e.target.value }))}
                        />
                        <button type="submit" disabled={busy || !criterionForm.label.trim()} className="btn-secondary px-2 py-1 text-xs">
                          {t("addCriterion")}
                        </button>
                      </form>
                    </div>

                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                          <th className="py-1">{t("subcontractor")}</th>
                          <th className="text-right">{t("amount")}</th>
                          {d.criteria.map((c) => (
                            <th key={c.id} className="px-1 text-center">
                              {c.label}
                            </th>
                          ))}
                          <th className="text-right">{t("weightedScore")}</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.invites.map((inv) => {
                          const bid = bidsBySubId[inv.subcontractor.id] as Bid | undefined;
                          const dBid = d.bids.find((b) => b.subcontractor.id === inv.subcontractor.id);
                          const scoresByCriterion = Object.fromEntries((dBid?.scores ?? []).map((s) => [s.criterionId, s.score]));
                          return (
                            <tr key={inv.subcontractor.id} className="border-b border-gray-100">
                              <td className="py-1">{inv.subcontractor.name}</td>
                              <td className="text-right font-medium tabular-nums">
                                {bid ? `${bid.amount} ${currency}` : <span className="text-gray-400">{t("noBidYet")}</span>}
                              </td>
                              {d.criteria.map((c) => (
                                <td key={c.id} className="px-1 text-center">
                                  {dBid ? (
                                    <select
                                      className="input w-14 py-0.5 text-center text-xs"
                                      value={scoresByCriterion[c.id] ?? ""}
                                      onChange={(e) => scoreBid(r.id, dBid.id, c.id, Number(e.target.value))}
                                    >
                                      <option value="" disabled>
                                        —
                                      </option>
                                      {[1, 2, 3, 4, 5].map((n) => (
                                        <option key={n} value={n}>
                                          {n}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                              ))}
                              <td className="text-right text-xs font-medium text-gray-700">
                                {dBid?.weightedScore ?? "—"}
                              </td>
                              <td className="pl-2 text-right">
                                {bid?.isAwarded && (
                                  <span className="rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700">
                                    {t("awarded")}
                                  </span>
                                )}
                                {bid && !bid.isAwarded && r.status === "open" && (
                                  <button onClick={() => award(r.id, bid.id)} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                                    {t("award")}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="flex items-center gap-2">
                      {r.bids.length > 1 && (
                        <button onClick={() => toggleLeveling(r.id)} className="btn-secondary w-fit px-3 py-1 text-xs">
                          {showLeveling ? t("hideLeveling") : t("viewLeveling")}
                        </button>
                      )}
                      {r.status === "open" && (
                        <button onClick={() => cancel(r.id)} disabled={busy} className="btn-secondary w-fit px-3 py-1 text-xs">
                          {t("cancelBidRequest")}
                        </button>
                      )}
                    </div>

                    {showLeveling && (
                      <div className="border-t border-gray-100 pt-3">
                        {!leveling ? (
                          <p className="text-xs text-gray-400">{tc("loading")}</p>
                        ) : leveling.scopeItems.length === 0 ? (
                          <p className="text-xs text-gray-400">{t("noLevelingData")}</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[480px] border-collapse text-xs">
                              <thead>
                                <tr className="border-b border-gray-200 text-left text-gray-500">
                                  <th className="py-1">{t("scopeItem")}</th>
                                  {leveling.bids.map((b) => (
                                    <th key={b.id} className="px-1 text-right">
                                      {b.subcontractorName}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {leveling.scopeItems.map((row) => (
                                  <tr key={row.description} className="border-b border-gray-100">
                                    <td className="py-1">{row.description}</td>
                                    {leveling.bids.map((b) => {
                                      const cell = row.byBid[b.id];
                                      return (
                                        <td key={b.id} className="px-1 text-right">
                                          {!cell ? (
                                            <span className="text-gray-300">{t("notMentioned")}</span>
                                          ) : (
                                            <span className={cell.included ? "text-gray-900" : "text-error-600 line-through"}>
                                              {cell.amount} {currency}
                                            </span>
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="font-semibold">
                                  <td className="pt-1">{t("totalBid")}</td>
                                  {leveling.bids.map((b) => (
                                    <td key={b.id} className="pt-1 text-right">
                                      {b.amount} {currency}
                                    </td>
                                  ))}
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
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
