"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatDateTime } from "@/lib/format-date";
import { ChangeOrderProfitabilityPanel } from "@/components/change-order-profitability-panel";

interface RateCatalogItem {
  id: string;
  name: string;
  unit: string;
}
type ClientDecision = "pending" | "approved" | "rejected" | "countered";
interface ChangeOrderLine {
  id: string;
  rateCatalogItemId: string;
  quantity: string;
  lineTotal: string;
  rateCatalogItem: { name: string; unit: string };
}
interface ChangeOrderApproval {
  userId: string;
  actorName: string;
  approvedAt: string;
}
interface ChangeOrder {
  id: string;
  number: number;
  title: string;
  description: string | null;
  status: "draft" | "pending_approval" | "approved";
  clientDecision: ClientDecision;
  sentAt: string | null;
  clientAccessToken: string | null;
  grandTotal: string;
  lines: ChangeOrderLine[];
  signerName: string | null;
  decisionAt: string | null;
  approvals: ChangeOrderApproval[];
  scheduleImpactDays: number | null;
}

/** The estimate's change-order sub-feature: its own list, forms, and per-order UI state, entirely
 * independent of the parent estimate's own busy/save state. */
export function EstimateChangeOrdersPanel({
  estimateId,
  rateItems,
  currency,
}: {
  estimateId: string;
  rateItems: RateCatalogItem[];
  currency: string;
}) {
  const t = useTranslations("estimates");
  const tc = useTranslations("common");
  const { data: me } = useMe();

  const [changeOrders, setChangeOrders] = useState<ChangeOrder[] | null>(null);
  const [coForm, setCoForm] = useState({ title: "", description: "" });
  const [coLineForm, setCoLineForm] = useState<Record<string, { rateCatalogItemId: string; quantity: string }>>({});
  const [coScheduleImpactForm, setCoScheduleImpactForm] = useState<Record<string, string>>({});
  const [coEmailSentTo, setCoEmailSentTo] = useState<Record<string, string | null>>({});
  const [coLinkCopiedId, setCoLinkCopiedId] = useState<string | null>(null);
  const [coSignatureUrls, setCoSignatureUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function loadChangeOrders() {
    apiFetch<ChangeOrder[]>(`/estimates/${estimateId}/change-orders`).then((list) => {
      setChangeOrders(list);
      for (const co of list) {
        if (co.clientDecision === "approved" && co.signerName) {
          apiFetch<Blob>(`/estimates/${estimateId}/change-orders/${co.id}/signature`).then((blob) =>
            setCoSignatureUrls((prev) => ({ ...prev, [co.id]: URL.createObjectURL(blob) })),
          );
        }
      }
    });
  }

  useEffect(loadChangeOrders, [estimateId]);

  async function downloadChangeOrderPdf(co: ChangeOrder) {
    const blob = await apiFetch<Blob>(`/estimates/${estimateId}/change-orders/${co.id}/pdf`);
    downloadBlob(blob, `CO-${co.number}-${co.title}.pdf`);
  }

  async function createChangeOrder(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/estimates/${estimateId}/change-orders`, {
        method: "POST",
        body: JSON.stringify({ title: coForm.title, description: coForm.description || undefined }),
      });
      setCoForm({ title: "", description: "" });
      loadChangeOrders();
    } finally {
      setBusy(false);
    }
  }

  async function addChangeOrderLine(coId: string) {
    const line = coLineForm[coId] ?? { rateCatalogItemId: rateItems[0]?.id ?? "", quantity: "1" };
    if (!line.rateCatalogItemId) return;
    setBusy(true);
    try {
      await apiFetch(`/estimates/${estimateId}/change-orders/${coId}/lines`, {
        method: "POST",
        body: JSON.stringify({ rateCatalogItemId: line.rateCatalogItemId, quantity: Number(line.quantity) }),
      });
      loadChangeOrders();
    } finally {
      setBusy(false);
    }
  }

  async function saveScheduleImpact(coId: string) {
    const raw = coScheduleImpactForm[coId];
    if (raw === undefined || raw === "") return;
    setBusy(true);
    try {
      await apiFetch(`/estimates/${estimateId}/change-orders/${coId}/schedule-impact`, {
        method: "POST",
        body: JSON.stringify({ scheduleImpactDays: Number(raw) }),
      });
      loadChangeOrders();
    } finally {
      setBusy(false);
    }
  }

  async function approveChangeOrder(coId: string) {
    setBusy(true);
    try {
      await apiFetch(`/estimates/${estimateId}/change-orders/${coId}/approve`, { method: "POST" });
      loadChangeOrders();
    } finally {
      setBusy(false);
    }
  }

  async function sendChangeOrder(coId: string) {
    setBusy(true);
    try {
      const result = await apiFetch<{ emailSentTo: string | null }>(
        `/estimates/${estimateId}/change-orders/${coId}/send`,
        { method: "POST" },
      );
      setCoEmailSentTo((m) => ({ ...m, [coId]: result.emailSentTo }));
      loadChangeOrders();
    } finally {
      setBusy(false);
    }
  }

  async function copyChangeOrderLink(co: ChangeOrder) {
    if (!co.clientAccessToken) return;
    await navigator.clipboard.writeText(`${window.location.origin}/change-order/${co.clientAccessToken}`);
    setCoLinkCopiedId(co.id);
  }

  async function declineChangeOrderOnBehalfOfClient(co: ChangeOrder) {
    const note = window.prompt(t("declineOnBehalfNotePrompt"));
    if (!note || !note.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/estimates/${estimateId}/change-orders/${co.id}/decline`, { method: "POST", body: JSON.stringify({ note: note.trim() }) });
      loadChangeOrders();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("changeOrders")}</h2>
      <p className="mb-4 text-xs text-gray-500">{t("changeOrdersHint")}</p>

      {changeOrders && changeOrders.length > 0 && (
        <div className="mb-6 flex flex-col gap-4">
          {changeOrders.map((co) => {
            const line = coLineForm[co.id] ?? { rateCatalogItemId: rateItems[0]?.id ?? "", quantity: "1" };
            return (
              <div key={co.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    CO-{co.number} — {co.title}
                  </span>
                  <span className="text-xs text-gray-500">
                    {co.status === "approved" ? t("approved") : co.status === "pending_approval" ? t("pendingApproval") : t("draft")}
                    {co.sentAt && ` · ${t(`clientDecision_${co.clientDecision}`)}`}
                  </span>
                </div>
                {co.description && <p className="mt-1 text-xs text-gray-500">{co.description}</p>}

                {co.status === "pending_approval" && me?.company.changeOrderRequiredApprovalCount && (
                  <div className="mt-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2">
                    <p className="text-xs text-warning-700">
                      {t("approvalProgress", { count: co.approvals.length, required: me.company.changeOrderRequiredApprovalCount })}
                    </p>
                    <p className="mt-0.5 text-xs text-warning-700">{co.approvals.map((a) => a.actorName).join(", ")}</p>
                  </div>
                )}

                {co.lines.length > 0 && (
                  <div className="overflow-x-auto">
                  <table className="mt-3 w-full border-collapse text-xs">
                    <tbody>
                      {co.lines.map((l) => (
                        <tr key={l.id} className="border-b border-gray-100">
                          <td className="py-1">{l.rateCatalogItem.name}</td>
                          <td>
                            {l.quantity} {l.rateCatalogItem.unit}
                          </td>
                          <td className="text-right">
                            {l.lineTotal} {currency}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
                <p className="mt-2 text-right text-xs font-medium">
                  {t("grandTotal")}: {co.grandTotal} {currency}
                </p>
                {co.scheduleImpactDays !== null && (
                  <p className="mt-1 text-right text-xs text-gray-500">
                    {t("scheduleImpact")}: {co.scheduleImpactDays >= 0 ? "+" : ""}
                    {co.scheduleImpactDays} {t("days")}
                  </p>
                )}

                {co.status === "draft" && (
                  <div className="mt-3 flex items-end gap-2 border-t border-gray-100 pt-3">
                    <select
                      className="input"
                      value={line.rateCatalogItemId}
                      onChange={(e) =>
                        setCoLineForm((m) => ({ ...m, [co.id]: { ...line, rateCatalogItemId: e.target.value } }))
                      }
                    >
                      {rateItems.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.unit})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      className="input w-24"
                      value={line.quantity}
                      onChange={(e) => setCoLineForm((m) => ({ ...m, [co.id]: { ...line, quantity: e.target.value } }))}
                    />
                    <button
                      type="button"
                      onClick={() => addChangeOrderLine(co.id)}
                      disabled={busy}
                      className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
                    >
                      {t("addLine")}
                    </button>
                  </div>
                )}

                {co.status === "draft" && (
                  <div className="mt-2 flex items-end gap-2">
                    <input
                      type="number"
                      placeholder={t("scheduleImpactPlaceholder")}
                      className="input w-40"
                      value={coScheduleImpactForm[co.id] ?? (co.scheduleImpactDays ?? "")}
                      onChange={(e) => setCoScheduleImpactForm((m) => ({ ...m, [co.id]: e.target.value }))}
                    />
                    <button
                      type="button"
                      onClick={() => saveScheduleImpact(co.id)}
                      disabled={busy}
                      className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
                    >
                      {tc("save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => approveChangeOrder(co.id)}
                      disabled={busy || co.lines.length === 0}
                      className="btn-primary ml-auto shrink-0 px-3 py-1.5 text-xs"
                    >
                      {t("approve")}
                    </button>
                  </div>
                )}

                {co.status === "pending_approval" && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <button
                      type="button"
                      onClick={() => approveChangeOrder(co.id)}
                      disabled={busy}
                      className="btn-primary px-3 py-1.5 text-xs"
                    >
                      {t("approve")}
                    </button>
                  </div>
                )}

                {co.status === "approved" && !co.sentAt && (
                  <button
                    type="button"
                    onClick={() => sendChangeOrder(co.id)}
                    disabled={busy}
                    className="btn-secondary mt-3 px-3 py-1.5 text-xs"
                  >
                    {t("sendToClient")}
                  </button>
                )}

                {co.sentAt && co.clientAccessToken && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        className="input flex-1 text-xs"
                        value={`${typeof window !== "undefined" ? window.location.origin : ""}/change-order/${co.clientAccessToken}`}
                      />
                      <button
                        type="button"
                        onClick={() => copyChangeOrderLink(co)}
                        className="btn-secondary shrink-0 px-3 py-1 text-xs"
                      >
                        {coLinkCopiedId === co.id ? tc("saved") : t("copyLink")}
                      </button>
                    </div>
                    {coEmailSentTo[co.id] !== undefined && (
                      <p className="mt-2 text-xs text-gray-500">
                        {coEmailSentTo[co.id]
                          ? tc("emailedTo", { email: coEmailSentTo[co.id] as string })
                          : tc("noClientEmail")}
                      </p>
                    )}
                  </div>
                )}

                {co.sentAt && co.clientDecision === "pending" && (
                  <button
                    onClick={() => declineChangeOrderOnBehalfOfClient(co)}
                    disabled={busy}
                    className="btn-secondary mt-3 px-3 py-1 text-xs"
                  >
                    {t("declineOnBehalfOfClient")}
                  </button>
                )}

                {co.clientDecision === "approved" && co.signerName && (
                  <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3 text-xs text-gray-600">
                    {coSignatureUrls[co.id] && (
                      <img
                        src={coSignatureUrls[co.id]}
                        alt={t("signature")}
                        className="h-6 rounded border border-gray-200 bg-white px-1"
                      />
                    )}
                    <span>
                      {t("signedBy", { name: co.signerName })}
                      {co.decisionAt && ` · ${formatDateTime(new Date(co.decisionAt))}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => downloadChangeOrderPdf(co)}
                      className="btn-secondary ml-auto shrink-0 px-2 py-1 text-xs"
                    >
                      {t("downloadPdf")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ChangeOrderProfitabilityPanel estimateId={estimateId} currency={currency} />

      <form onSubmit={createChangeOrder} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input
          required
          placeholder={t("changeOrderTitlePlaceholder")}
          className="input"
          value={coForm.title}
          onChange={(e) => setCoForm((f) => ({ ...f, title: e.target.value }))}
        />
        <input
          placeholder={t("changeOrderDescriptionPlaceholder")}
          className="input"
          value={coForm.description}
          onChange={(e) => setCoForm((f) => ({ ...f, description: e.target.value }))}
        />
        <button type="submit" disabled={busy} className="btn-secondary shrink-0">
          {t("createChangeOrder")}
        </button>
      </form>
    </div>
  );
}
