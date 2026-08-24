"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface Subcontractor {
  id: string;
  name: string;
}
interface Bid {
  id: string;
  amount: string;
  notes: string | null;
  isAwarded: boolean;
  submittedAt: string;
  subcontractor: Subcontractor;
}
interface Invite {
  subcontractor: Subcontractor;
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
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", dueDate: "", subcontractorIds: new Set<string>() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<BidRequest[]>(`/bid-requests?projectId=${projectId}`).then(setRequests);
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
    } finally {
      setBusy(false);
    }
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
            const bidsBySubId = Object.fromEntries(r.bids.map((b) => [b.subcontractor.id, b]));
            return (
              <li key={r.id} className="card">
                <button
                  onClick={() => setExpandedId(expanded ? null : r.id)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{r.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}>{t(r.status)}</span>
                  </div>
                  <span className="text-xs text-gray-400">{t("bidCount", { count: r.bids.length, total: r.invites.length })}</span>
                </button>

                {expanded && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 text-sm">
                    {r.description && <p className="text-gray-600">{r.description}</p>}
                    {error && <p className="text-xs text-error-600">{error}</p>}
                    <table className="w-full border-collapse text-sm">
                      <tbody>
                        {r.invites.map((inv) => {
                          const bid = bidsBySubId[inv.subcontractor.id];
                          return (
                            <tr key={inv.subcontractor.id} className="border-b border-gray-100">
                              <td className="py-1">{inv.subcontractor.name}</td>
                              <td className="text-right font-medium tabular-nums">
                                {bid ? `${bid.amount} ${currency}` : <span className="text-gray-400">{t("noBidYet")}</span>}
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
                    {r.status === "open" && (
                      <button onClick={() => cancel(r.id)} disabled={busy} className="btn-secondary mt-1 w-fit px-3 py-1 text-xs">
                        {t("cancelBidRequest")}
                      </button>
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
