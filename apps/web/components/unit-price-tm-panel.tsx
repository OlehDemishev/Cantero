"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { TMTicketStatus } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatCurrency } from "@/lib/format-currency";
import { formatDate } from "@/lib/format-date";

interface UnitPriceMeasurement {
  id: string;
  measuredQuantity: number;
  measuredAt: string;
  measuredByName: string;
  notes: string | null;
}
interface UnitPriceItem {
  id: string;
  description: string;
  unit: string;
  contractUnitPrice: number;
  estimatedQuantity: number | null;
  measurements: UnitPriceMeasurement[];
}
interface TMTicket {
  id: string;
  ticketNumber: number;
  workDate: string;
  description: string;
  laborCost: number;
  equipmentCost: number;
  materialCost: number;
  status: TMTicketStatus;
  ownerSignerName: string | null;
  signedAt: string | null;
  disputeReason: string | null;
  revisionCount: number;
}

const TICKET_STATUS_STYLES: Record<TMTicketStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  submitted: "bg-gray-100 text-gray-600",
  approved: "bg-success-50 text-success-700",
  rejected: "bg-error-50 text-error-700",
  disputed: "bg-warning-50 text-warning-700",
};

export function UnitPriceTmPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("unitPriceTm");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "USD";
  const money = (amount: number | string) => formatCurrency(amount, currency, me?.company.locale);

  const [items, setItems] = useState<UnitPriceItem[] | null>(null);
  const [tickets, setTickets] = useState<TMTicket[] | null>(null);
  const [creatingItem, setCreatingItem] = useState(false);
  const [itemForm, setItemForm] = useState({ description: "", unit: "", contractUnitPrice: "", estimatedQuantity: "" });
  const [measureForms, setMeasureForms] = useState<Record<string, { measuredQuantity: string; measuredByName: string }>>({});
  const [measuringId, setMeasuringId] = useState<string | null>(null);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [ticketForm, setTicketForm] = useState({ workDate: "", description: "", laborCost: "", equipmentCost: "", materialCost: "" });
  const [decideForms, setDecideForms] = useState<Record<string, string>>({});
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [disputeReasonForms, setDisputeReasonForms] = useState<Record<string, string>>({});
  const [disputingId, setDisputingId] = useState<string | null>(null);
  const [revisingId, setRevisingId] = useState<string | null>(null);
  const [reviseForms, setReviseForms] = useState<Record<string, { laborCost: string; equipmentCost: string; materialCost: string }>>({});
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<UnitPriceItem[]>(`/projects/${projectId}/unit-price-items`).then(setItems);
    apiFetch<TMTicket[]>(`/projects/${projectId}/tm-tickets`).then(setTickets);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function submitItem(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/unit-price-items`, {
        method: "POST",
        body: JSON.stringify({
          description: itemForm.description,
          unit: itemForm.unit,
          contractUnitPrice: Number(itemForm.contractUnitPrice),
          estimatedQuantity: itemForm.estimatedQuantity ? Number(itemForm.estimatedQuantity) : undefined,
        }),
      });
      setItemForm({ description: "", unit: "", contractUnitPrice: "", estimatedQuantity: "" });
      setCreatingItem(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function submitMeasurement(e: React.FormEvent, itemId: string) {
    e.preventDefault();
    const draft = measureForms[itemId];
    if (!draft) return;
    setBusy(true);
    try {
      await apiFetch(`/unit-price-items/${itemId}/measurements`, {
        method: "POST",
        body: JSON.stringify({ measuredQuantity: Number(draft.measuredQuantity), measuredByName: draft.measuredByName }),
      });
      setMeasureForms((f) => ({ ...f, [itemId]: { measuredQuantity: "", measuredByName: "" } }));
      setMeasuringId(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function submitTicket(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/tm-tickets`, {
        method: "POST",
        body: JSON.stringify({
          workDate: new Date(ticketForm.workDate).toISOString(),
          description: ticketForm.description,
          laborCost: Number(ticketForm.laborCost || 0),
          equipmentCost: Number(ticketForm.equipmentCost || 0),
          materialCost: Number(ticketForm.materialCost || 0),
        }),
      });
      setTicketForm({ workDate: "", description: "", laborCost: "", equipmentCost: "", materialCost: "" });
      setCreatingTicket(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, status: "approved" | "rejected" | "disputed") {
    const ownerSignerName = decideForms[id];
    if (!ownerSignerName) return;
    if (status === "disputed" && !disputeReasonForms[id]) return;
    setBusy(true);
    try {
      await apiFetch(`/tm-tickets/${id}/decide`, {
        method: "POST",
        body: JSON.stringify({ status, ownerSignerName, disputeReason: status === "disputed" ? disputeReasonForms[id] : undefined }),
      });
      setDecidingId(null);
      setDisputingId(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function reviseTicket(id: string) {
    const draft = reviseForms[id];
    if (!draft) return;
    setBusy(true);
    try {
      await apiFetch(`/tm-tickets/${id}/revise`, {
        method: "POST",
        body: JSON.stringify({
          laborCost: draft.laborCost !== "" ? Number(draft.laborCost) : undefined,
          equipmentCost: draft.equipmentCost !== "" ? Number(draft.equipmentCost) : undefined,
          materialCost: draft.materialCost !== "" ? Number(draft.materialCost) : undefined,
        }),
      });
      setRevisingId(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{t("unitPriceTitle")}</h2>
        {!creatingItem && (
          <button onClick={() => setCreatingItem(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newUnitPriceItem")}
          </button>
        )}
      </div>

      {creatingItem && (
        <form onSubmit={submitItem} className="card mb-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("description")}</span>
            <input
              required
              className="input"
              value={itemForm.description}
              onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <div className="flex gap-3">
            <label className="flex w-28 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("unit")}</span>
              <input required className="input" value={itemForm.unit} onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))} />
            </label>
            <label className="flex w-40 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("contractUnitPrice")}</span>
              <input
                required
                type="number"
                min="0"
                step="0.0001"
                className="input"
                value={itemForm.contractUnitPrice}
                onChange={(e) => setItemForm((f) => ({ ...f, contractUnitPrice: e.target.value }))}
              />
            </label>
            <label className="flex w-40 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("estimatedQuantity")}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={itemForm.estimatedQuantity}
                onChange={(e) => setItemForm((f) => ({ ...f, estimatedQuantity: e.target.value }))}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setCreatingItem(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {items === null ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noUnitPriceItems")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const installed = item.measurements.reduce((sum, m) => sum + Number(m.measuredQuantity), 0);
            const billed = installed * Number(item.contractUnitPrice);
            const variance = item.estimatedQuantity !== null ? installed - Number(item.estimatedQuantity) : null;
            const draft = measureForms[item.id] ?? { measuredQuantity: "", measuredByName: "" };
            return (
              <li key={item.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-sm font-medium text-gray-900">{item.description}</span>
                    <p className="mt-1 text-xs text-gray-500">
                      {t("installedAtPrice", { installed, unit: item.unit, price: money(item.contractUnitPrice) })}
                    </p>
                    {variance !== null && (
                      <p className="mt-1 text-xs text-gray-500">{t("varianceFromEstimate", { variance, unit: item.unit })}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">{money(billed)}</span>
                </div>

                {item.measurements.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1 border-t border-gray-100 pt-3">
                    {item.measurements.map((m) => (
                      <li key={m.id} className="flex items-center justify-between text-xs text-gray-600">
                        <span>
                          {m.measuredQuantity} {item.unit} — {m.measuredByName}
                        </span>
                        <span>{formatDate(new Date(m.measuredAt))}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {measuringId === item.id ? (
                  <form onSubmit={(e) => submitMeasurement(e, item.id)} className="mt-3 flex items-end gap-2 border-t border-gray-100 pt-3">
                    <label className="flex w-32 flex-col gap-1 text-xs">
                      <span className="font-medium text-gray-700">{t("measuredQuantity")}</span>
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        className="input py-1 text-xs"
                        value={draft.measuredQuantity}
                        onChange={(e) => setMeasureForms((f) => ({ ...f, [item.id]: { ...draft, measuredQuantity: e.target.value } }))}
                      />
                    </label>
                    <label className="flex flex-1 flex-col gap-1 text-xs">
                      <span className="font-medium text-gray-700">{t("measuredByName")}</span>
                      <input
                        required
                        className="input py-1 text-xs"
                        value={draft.measuredByName}
                        onChange={(e) => setMeasureForms((f) => ({ ...f, [item.id]: { ...draft, measuredByName: e.target.value } }))}
                      />
                    </label>
                    <button type="submit" disabled={busy} className="btn-primary px-2.5 py-1 text-xs">
                      {tc("save")}
                    </button>
                    <button type="button" onClick={() => setMeasuringId(null)} className="btn-secondary px-2.5 py-1 text-xs">
                      {tc("cancel")}
                    </button>
                  </form>
                ) : (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <button onClick={() => setMeasuringId(item.id)} className="btn-secondary px-2.5 py-1 text-xs">
                      {t("addMeasurement")}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{t("tmTicketsTitle")}</h2>
        {!creatingTicket && (
          <button onClick={() => setCreatingTicket(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newTMTicket")}
          </button>
        )}
      </div>

      {creatingTicket && (
        <form onSubmit={submitTicket} className="card mb-4 flex flex-col gap-3">
          <label className="flex w-40 flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("workDate")}</span>
            <input
              required
              type="date"
              className="input"
              value={ticketForm.workDate}
              onChange={(e) => setTicketForm((f) => ({ ...f, workDate: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("description")}</span>
            <textarea
              required
              rows={2}
              className="input"
              value={ticketForm.description}
              onChange={(e) => setTicketForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("laborCost")}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={ticketForm.laborCost}
                onChange={(e) => setTicketForm((f) => ({ ...f, laborCost: e.target.value }))}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("equipmentCost")}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={ticketForm.equipmentCost}
                onChange={(e) => setTicketForm((f) => ({ ...f, equipmentCost: e.target.value }))}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("materialCost")}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={ticketForm.materialCost}
                onChange={(e) => setTicketForm((f) => ({ ...f, materialCost: e.target.value }))}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setCreatingTicket(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {tickets === null ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noTMTickets")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tickets.map((ticket) => {
            const total = Number(ticket.laborCost) + Number(ticket.equipmentCost) + Number(ticket.materialCost);
            return (
              <li key={ticket.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{t("ticketNumber", { number: ticket.ticketNumber })}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TICKET_STATUS_STYLES[ticket.status]}`}>
                        {t(ticket.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{formatDate(new Date(ticket.workDate))}</p>
                    <p className="mt-1 text-xs text-gray-500">{ticket.description}</p>
                    {ticket.ownerSignerName && ticket.signedAt && (
                      <p className="mt-1.5 text-xs text-gray-500">
                        {t("signedBy", { name: ticket.ownerSignerName, date: formatDate(new Date(ticket.signedAt)) })}
                      </p>
                    )}
                    {ticket.status === "disputed" && ticket.disputeReason && (
                      <p className="mt-1.5 text-xs text-warning-700">{t("disputeReasonLabel", { reason: ticket.disputeReason })}</p>
                    )}
                    {ticket.revisionCount > 0 && <p className="mt-1 text-xs text-gray-400">{t("revisionCount", { count: ticket.revisionCount })}</p>}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">{money(total)}</span>
                </div>

                {ticket.status === "draft" &&
                  (decidingId === ticket.id ? (
                    <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
                      <div className="flex items-end gap-2">
                        <label className="flex flex-1 flex-col gap-1 text-xs">
                          <span className="font-medium text-gray-700">{t("ownerSignerName")}</span>
                          <input
                            required
                            className="input py-1 text-xs"
                            value={decideForms[ticket.id] ?? ""}
                            onChange={(e) => setDecideForms((f) => ({ ...f, [ticket.id]: e.target.value }))}
                          />
                        </label>
                        <button
                          onClick={() => decide(ticket.id, "approved")}
                          disabled={busy || !decideForms[ticket.id]}
                          className="btn-primary px-2.5 py-1 text-xs"
                        >
                          {t("approve")}
                        </button>
                        <button
                          onClick={() => (disputingId === ticket.id ? setDisputingId(null) : setDisputingId(ticket.id))}
                          disabled={busy || !decideForms[ticket.id]}
                          className="btn-secondary px-2.5 py-1 text-xs"
                        >
                          {t("dispute")}
                        </button>
                        <button
                          onClick={() => decide(ticket.id, "rejected")}
                          disabled={busy || !decideForms[ticket.id]}
                          className="btn-secondary px-2.5 py-1 text-xs"
                        >
                          {t("reject")}
                        </button>
                        <button
                          onClick={() => {
                            setDecidingId(null);
                            setDisputingId(null);
                          }}
                          className="btn-secondary px-2.5 py-1 text-xs"
                        >
                          {tc("cancel")}
                        </button>
                      </div>
                      {disputingId === ticket.id && (
                        <div className="flex items-end gap-2">
                          <label className="flex flex-1 flex-col gap-1 text-xs">
                            <span className="font-medium text-gray-700">{t("disputeReasonPlaceholder")}</span>
                            <input
                              required
                              className="input py-1 text-xs"
                              value={disputeReasonForms[ticket.id] ?? ""}
                              onChange={(e) => setDisputeReasonForms((f) => ({ ...f, [ticket.id]: e.target.value }))}
                            />
                          </label>
                          <button
                            onClick={() => decide(ticket.id, "disputed")}
                            disabled={busy || !decideForms[ticket.id] || !disputeReasonForms[ticket.id]}
                            className="btn-primary px-2.5 py-1 text-xs"
                          >
                            {t("submitDispute")}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <button onClick={() => setDecidingId(ticket.id)} className="btn-secondary px-2.5 py-1 text-xs">
                        {t("decide")}
                      </button>
                    </div>
                  ))}

                {ticket.status === "disputed" &&
                  (revisingId === ticket.id ? (
                    <div className="mt-3 flex items-end gap-2 border-t border-gray-100 pt-3">
                      {(["laborCost", "equipmentCost", "materialCost"] as const).map((field) => (
                        <label key={field} className="flex flex-1 flex-col gap-1 text-xs">
                          <span className="font-medium text-gray-700">{t(field)}</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="input py-1 text-xs"
                            value={reviseForms[ticket.id]?.[field] ?? ""}
                            onChange={(e) => {
                              const current = reviseForms[ticket.id] ?? { laborCost: "", equipmentCost: "", materialCost: "" };
                              setReviseForms((f) => ({ ...f, [ticket.id]: { ...current, [field]: e.target.value } }));
                            }}
                          />
                        </label>
                      ))}
                      <button onClick={() => reviseTicket(ticket.id)} disabled={busy} className="btn-primary px-2.5 py-1 text-xs">
                        {t("resubmit")}
                      </button>
                      <button onClick={() => setRevisingId(null)} className="btn-secondary px-2.5 py-1 text-xs">
                        {tc("cancel")}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <button onClick={() => setRevisingId(ticket.id)} className="btn-secondary px-2.5 py-1 text-xs">
                        {t("reviseAndResubmit")}
                      </button>
                    </div>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
