"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { TRANSMITTAL_METHODS, type TransmittalMethod } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface TransmittalItem {
  id: string;
  description: string;
  quantity: number;
}
interface Transmittal {
  id: string;
  number: number;
  recipientName: string;
  recipientCompany: string | null;
  method: TransmittalMethod;
  purpose: string | null;
  sentAt: string;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
  items: TransmittalItem[];
}

interface DraftItem {
  description: string;
  quantity: string;
}

export function TransmittalsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("transmittals");
  const tc = useTranslations("common");

  const [transmittals, setTransmittals] = useState<Transmittal[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ recipientName: "", recipientCompany: "", method: "email" as TransmittalMethod, purpose: "" });
  const [items, setItems] = useState<DraftItem[]>([{ description: "", quantity: "1" }]);
  const [busy, setBusy] = useState(false);
  const [ackingId, setAckingId] = useState<string | null>(null);
  const [ackName, setAckName] = useState("");

  function load() {
    apiFetch<Transmittal[]>(`/projects/${projectId}/transmittals`).then(setTransmittals);
  }
  useEffect(load, [projectId]);

  function addItemRow() {
    setItems((i) => [...i, { description: "", quantity: "1" }]);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const validItems = items.filter((i) => i.description.trim());
    if (!form.recipientName.trim() || validItems.length === 0) return;
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/transmittals`, {
        method: "POST",
        body: JSON.stringify({
          recipientName: form.recipientName.trim(),
          recipientCompany: form.recipientCompany || undefined,
          method: form.method,
          purpose: form.purpose || undefined,
          items: validItems.map((i) => ({ description: i.description.trim(), quantity: Number(i.quantity) || 1 })),
        }),
      });
      setForm({ recipientName: "", recipientCompany: "", method: "email", purpose: "" });
      setItems([{ description: "", quantity: "1" }]);
      setAdding(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function acknowledge(id: string) {
    if (!ackName.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/transmittals/${id}/acknowledge`, { method: "POST", body: JSON.stringify({ acknowledgedByName: ackName.trim() }) });
      setAckingId(null);
      setAckName("");
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{t("title")}</h2>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn-secondary px-2.5 py-1 text-xs">
            {t("newTransmittal")}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500">{t("hint")}</p>

      {adding && (
        <form onSubmit={create} className="card mb-3 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <input
              required
              placeholder={t("recipientNamePlaceholder")}
              className="input flex-1"
              value={form.recipientName}
              onChange={(e) => setForm((f) => ({ ...f, recipientName: e.target.value }))}
            />
            <input
              placeholder={t("recipientCompanyPlaceholder")}
              className="input flex-1"
              value={form.recipientCompany}
              onChange={(e) => setForm((f) => ({ ...f, recipientCompany: e.target.value }))}
            />
            <select className="input" value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as TransmittalMethod }))}>
              {TRANSMITTAL_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`method_${m}`)}
                </option>
              ))}
            </select>
          </div>
          <input
            placeholder={t("purposePlaceholder")}
            className="input"
            value={form.purpose}
            onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
          />

          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">{t("items")}</span>
            <button type="button" onClick={addItemRow} className="btn-secondary px-2 py-1 text-xs">
              + {t("addItem")}
            </button>
          </div>
          {items.map((item, i) => (
            <div key={i} className="flex gap-2">
              <input
                placeholder={t("itemDescriptionPlaceholder")}
                className="input flex-1"
                value={item.description}
                onChange={(e) => setItems((its) => its.map((it, j) => (j === i ? { ...it, description: e.target.value } : it)))}
              />
              <input
                type="number"
                min="1"
                className="input w-20"
                value={item.quantity}
                onChange={(e) => setItems((its) => its.map((it, j) => (j === i ? { ...it, quantity: e.target.value } : it)))}
              />
            </div>
          ))}

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

      {!transmittals ? (
        <p className="text-sm text-gray-500">{tc("loading")}</p>
      ) : transmittals.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noTransmittals")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {transmittals.map((tr) => (
            <li key={tr.id} className="card">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">
                  T-{tr.number} — {tr.recipientName}
                  {tr.recipientCompany && <span className="text-xs text-gray-400"> ({tr.recipientCompany})</span>}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tr.acknowledgedAt ? "bg-success-50 text-success-700" : "bg-gray-100 text-gray-600"}`}>
                  {tr.acknowledgedAt ? t("acknowledged") : t("pending")}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {t(`method_${tr.method}`)} · {formatDate(new Date(tr.sentAt))}
                {tr.purpose && ` · ${tr.purpose}`}
              </p>
              <ul className="mt-2 flex flex-col gap-0.5 text-xs text-gray-600">
                {tr.items.map((item) => (
                  <li key={item.id}>
                    {item.description} × {item.quantity}
                  </li>
                ))}
              </ul>
              {tr.acknowledgedAt ? (
                <p className="mt-2 text-xs text-success-700">{t("acknowledgedBy", { name: tr.acknowledgedByName ?? "" })}</p>
              ) : ackingId === tr.id ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    placeholder={t("acknowledgedByPlaceholder")}
                    className="input flex-1 py-1 text-xs"
                    value={ackName}
                    onChange={(e) => setAckName(e.target.value)}
                  />
                  <button onClick={() => acknowledge(tr.id)} disabled={busy} className="btn-primary px-2.5 py-1 text-xs">
                    {tc("save")}
                  </button>
                </div>
              ) : (
                <button onClick={() => setAckingId(tr.id)} className="btn-secondary mt-2 px-2.5 py-1 text-xs">
                  {t("acknowledge")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
