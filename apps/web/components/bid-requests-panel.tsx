"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUpload, downloadBlob, ApiError, notifyApiError } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/lib/use-me";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatCurrency } from "@/lib/format-currency";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/status-tone";
import { Field, FormError } from "@/components/ui/field";

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
interface BidRequestLine {
  positionNo: string;
  description: string;
  quantity: string;
  unit: string;
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
  lines: BidRequestLine[];
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

export function BidRequestsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("bidding");
  const confirm = useConfirm();
  const td = useTranslations("dialog");
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const { data: requests = null, reload: reloadRequests, error: requestsError } = useApi<BidRequest[]>(`/bid-requests?projectId=${projectId}`);
  const { data: subcontractors = [] } = useApi<Subcontractor[]>("/finance/subcontractors");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BidRequestDetail | null>(null);
  const [leveling, setLeveling] = useState<Leveling | null>(null);
  const [levelingError, setLevelingError] = useState<Error | null>(null);
  const [showLeveling, setShowLeveling] = useState(false);
  const [criterionForm, setCriterionForm] = useState({ label: "", weight: "5" });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", dueDate: "", subcontractorIds: new Set<string>() });
  const [lineForm, setLineForm] = useState<BidRequestLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gaebError, setGaebError] = useState<string | null>(null);

  function load() {
    void reloadRequests();
  }

  function loadDetail(id: string) {
    apiFetch<BidRequestDetail>(`/bid-requests/${id}`).then(setDetail).catch(notifyApiError);
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
    if (!leveling) loadLeveling(bidRequestId);
  }

  function loadLeveling(bidRequestId: string) {
    setLevelingError(null);
    apiFetch<Leveling>(`/bid-requests/${bidRequestId}/leveling`).then(setLeveling).catch(setLevelingError);
  }

  function toggleSub(id: string) {
    setForm((f) => {
      const next = new Set(f.subcontractorIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...f, subcontractorIds: next };
    });
  }

  function addLineRow() {
    setLineForm((rows) => [...rows, { positionNo: "", description: "", quantity: "", unit: "" }]);
  }

  function updateLineRow(index: number, field: keyof BidRequestLine, value: string) {
    setLineForm((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function removeLineRow(index: number) {
    setLineForm((rows) => rows.filter((_, i) => i !== index));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.subcontractorIds.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const lines = lineForm
        .filter((l) => l.positionNo.trim() && l.description.trim() && l.quantity.trim() && l.unit.trim())
        .map((l) => ({ positionNo: l.positionNo.trim(), description: l.description.trim(), quantity: Number(l.quantity), unit: l.unit.trim() }));
      await apiFetch("/bid-requests", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          title: form.title,
          description: form.description || undefined,
          dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
          subcontractorIds: Array.from(form.subcontractorIds),
          lines: lines.length > 0 ? lines : undefined,
        }),
      });
      setForm({ title: "", description: "", dueDate: "", subcontractorIds: new Set() });
      setLineForm([]);
      setCreating(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function downloadGaeb(bidRequestId: string, title: string) {
    setGaebError(null);
    try {
      const blob = await apiFetch<Blob>(`/bid-requests/${bidRequestId}/gaeb-da83.xml`);
      downloadBlob(blob, `${title}-da83.xml`);
    } catch (err) {
      setGaebError(err instanceof ApiError ? err.message : tc("error"));
    }
  }

  async function importGaebBid(bidRequestId: string, subcontractorId: string, file: File) {
    setGaebError(null);
    setBusy(true);
    try {
      const result = await apiUpload<{ warnings: string[] }>(`/bid-requests/${bidRequestId}/gaeb-da84/${subcontractorId}`, file);
      if (result.warnings.length > 0) setGaebError(result.warnings.join(" "));
      loadDetail(bidRequestId);
      load();
    } catch (err) {
      setGaebError(err instanceof ApiError ? err.message : tc("error"));
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
    if (!(await confirm({ message: t("confirmCancel"), tone: "danger", verb: "cancelItem", cancelLabel: td("keep") }))) return;
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
    if (!(await confirm({ message: td("removeCriterion"), tone: "danger", verb: "remove" }))) return;
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
        <h2 className="text-sm font-semibold text-fg-muted">{t("title")}</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newBidRequest")}
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={submit} className="card mb-4 flex flex-col gap-3">
          <Field label={t("scopeTitle")}>
            <input required className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </Field>
          <Field label={tc("description")}>
            <textarea
              rows={2}
              className="input"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>
          <label className="flex w-auto flex-col gap-1.5 text-sm">
            <span className="font-medium text-fg-muted">{t("dueDate")}</span>
            <input
              type="date"
              className="input"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </label>
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-fg-muted">{t("inviteSubcontractors")}</span>
            {subcontractors.length === 0 ? (
              <p className="text-xs text-fg-subtle">{t("noSubcontractors")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {subcontractors.map((s) => (
                  <label key={s.id} className="flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs">
                    <input type="checkbox" checked={form.subcontractorIds.has(s.id)} onChange={() => toggleSub(s.id)} />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-fg-muted">{t("scopeLines")}</span>
            <p className="text-xs text-fg-subtle">{t("scopeLinesHint")}</p>
            {lineForm.map((row, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  placeholder={t("positionNo")} aria-label={t("positionNo")}
                  className="input w-20 py-1 text-xs"
                  value={row.positionNo}
                  onChange={(e) => updateLineRow(i, "positionNo", e.target.value)}
                />
                <input
                  placeholder={t("lineDescription")} aria-label={t("lineDescription")}
                  className="input flex-1 py-1 text-xs"
                  value={row.description}
                  onChange={(e) => updateLineRow(i, "description", e.target.value)}
                />
                <input
                  type="number"
                  step="any"
                  placeholder={t("quantity")} aria-label={t("quantity")}
                  className="input w-20 py-1 text-xs"
                  value={row.quantity}
                  onChange={(e) => updateLineRow(i, "quantity", e.target.value)}
                />
                <input
                  placeholder={t("unit")} aria-label={t("unit")}
                  className="input w-16 py-1 text-xs"
                  value={row.unit}
                  onChange={(e) => updateLineRow(i, "unit", e.target.value)}
                />
                <button aria-label={ta("remove")} type="button" onClick={() => removeLineRow(i)} className="text-fg-subtle hover:text-danger-fg">
                  ×
                </button>
              </div>
            ))}
            <button type="button" onClick={addLineRow} className="btn-secondary w-fit px-2 py-1 text-xs">
              {t("addLine")}
            </button>
          </div>
          {error && <FormError>{error}</FormError>}
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
        requestsError ? <ErrorState error={requestsError} onRetry={reloadRequests} compact /> : <Skeleton lines={3} />
      ) : requests.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noBidRequests")}</p>
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
                    <span className="text-sm font-medium text-fg">{r.title}</span>
                    <Badge tone={statusTone(r.status)}>{t(r.status)}</Badge>
                  </div>
                  <span className="text-xs text-fg-subtle">{t("bidCount", { count: r.bids.length, total: r.invites.length })}</span>
                </button>

                {expanded && !d && <p className="mt-3 text-xs text-fg-subtle">{tc("loading")}</p>}

                {d && (
                  <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 dark:border-gray-700 pt-3 text-sm">
                    {d.description && <p className="text-gray-600 dark:text-gray-300">{d.description}</p>}
                    {error && <FormError>{error}</FormError>}

                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("scoringCriteria")}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {d.criteria.map((c) => (
                          <Badge tone="neutral" className="flex" key={c.id}>
                            {c.label} ({c.weight})
                            <button aria-label={ta("removeItem", { name: c.label })} onClick={() => removeCriterion(r.id, c.id)} className="text-fg-subtle hover:text-danger-fg">
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <form onSubmit={(e) => addCriterion(r.id, e)} className="mt-1.5 flex items-center gap-1.5">
                        <input aria-label={ta("criterion")}
                          placeholder={t("criterionLabelPlaceholder")}
                          className="input py-1 text-xs"
                          value={criterionForm.label}
                          onChange={(e) => setCriterionForm((f) => ({ ...f, label: e.target.value }))}
                        />
                        <input aria-label={ta("weight")}
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

                    <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs text-fg-subtle">
                          <th scope="col" className="py-1">{t("subcontractor")}</th>
                          <th scope="col" className="text-right">{t("amount")}</th>
                          {d.criteria.map((c) => (
                            <th scope="col" key={c.id} className="px-1 text-center">
                              {c.label}
                            </th>
                          ))}
                          <th scope="col" className="text-right">{t("weightedScore")}</th>
                          <th scope="col"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.invites.map((inv) => {
                          const bid = bidsBySubId[inv.subcontractor.id] as Bid | undefined;
                          const dBid = d.bids.find((b) => b.subcontractor.id === inv.subcontractor.id);
                          const scoresByCriterion = Object.fromEntries((dBid?.scores ?? []).map((s) => [s.criterionId, s.score]));
                          return (
                            <tr key={inv.subcontractor.id} className="border-b border-gray-100 dark:border-gray-700">
                              <td className="py-1">{inv.subcontractor.name}</td>
                              <td className="text-right font-medium tabular-nums">
                                {bid ? `${formatCurrency(bid.amount, currency)}` : <span className="text-fg-subtle">{t("noBidYet")}</span>}
                              </td>
                              {d.criteria.map((c) => (
                                <td key={c.id} className="px-1 text-center">
                                  {dBid ? (
                                    <select aria-label={ta("fieldOf", { field: ta("score"), item: `${inv.subcontractor.name}, ${c.label}` })}
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
                                    <span className="text-fg-subtle">—</span>
                                  )}
                                </td>
                              ))}
                              <td className="text-right text-xs font-medium text-fg-muted">
                                {dBid?.weightedScore ?? "—"}
                              </td>
                              <td className="pl-2 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {bid?.isAwarded && (
                                    <Badge tone="success">
                                      {t("awarded")}
                                    </Badge>
                                  )}
                                  {bid && !bid.isAwarded && r.status === "open" && (
                                    <button onClick={() => award(r.id, bid.id)} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                                      {t("award")}
                                    </button>
                                  )}
                                  {r.status === "open" && d.lines.length > 0 && (
                                    <label className="btn-secondary cursor-pointer px-2 py-1 text-xs">
                                      {t("importGaebBid")}
                                      <input
                                        type="file"
                                        accept=".xml,application/xml,text/xml"
                                        className="hidden"
                                        disabled={busy}
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          e.target.value = "";
                                          if (file) importGaebBid(r.id, inv.subcontractor.id, file);
                                        }}
                                      />
                                    </label>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                    {gaebError && <FormError>{gaebError}</FormError>}
                    <div className="flex items-center gap-2">
                      {r.bids.length > 1 && (
                        <button onClick={() => toggleLeveling(r.id)} className="btn-secondary w-fit px-3 py-1 text-xs">
                          {showLeveling ? t("hideLeveling") : t("viewLeveling")}
                        </button>
                      )}
                      {d.lines.length > 0 && (
                        <button onClick={() => downloadGaeb(r.id, r.title)} className="btn-secondary w-fit px-3 py-1 text-xs">
                          {t("exportGaeb")}
                        </button>
                      )}
                      {r.status === "open" && (
                        <button onClick={() => cancel(r.id)} disabled={busy} className="btn-secondary w-fit px-3 py-1 text-xs">
                          {t("cancelBidRequest")}
                        </button>
                      )}
                    </div>

                    {showLeveling && (
                      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
                        {!leveling ? (
                          levelingError ? (
                            <ErrorState error={levelingError} onRetry={() => loadLeveling(r.id)} compact />
                          ) : (
                            <Skeleton lines={2} />
                          )
                        ) : leveling.scopeItems.length === 0 ? (
                          <p className="text-xs text-fg-subtle">{t("noLevelingData")}</p>
                        ) : (
                          <div tabIndex={0} className="overflow-x-auto">
                            <table className="w-full min-w-[480px] border-collapse text-xs">
                              <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                                  <th scope="col" className="py-1">{t("scopeItem")}</th>
                                  {leveling.bids.map((b) => (
                                    <th scope="col" key={b.id} className="px-1 text-right">
                                      {b.subcontractorName}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {leveling.scopeItems.map((row) => (
                                  <tr key={row.description} className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="py-1">{row.description}</td>
                                    {leveling.bids.map((b) => {
                                      const cell = row.byBid[b.id];
                                      return (
                                        <td key={b.id} className="px-1 text-right">
                                          {!cell ? (
                                            <span className="text-fg-subtle">{t("notMentioned")}</span>
                                          ) : (
                                            <span className={cell.included ? "text-fg" : "text-danger-fg line-through"}>
                                              {formatCurrency(cell.amount, currency)}
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
                                      {formatCurrency(b.amount, currency)}
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
