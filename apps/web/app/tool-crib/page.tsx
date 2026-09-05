"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { TOOL_CHECKOUT_CONDITIONS, type ToolCheckoutCondition } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { CalibrationPanel } from "@/components/calibration-panel";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatDate } from "@/lib/format-date";

interface Worker {
  id: string;
  name: string;
}
interface OpenCheckout {
  id: string;
  quantity: number;
  checkedOutAt: string;
  worker: { id: string; name: string };
}
interface ToolCribItem {
  id: string;
  name: string;
  barcode: string | null;
  replacementCost: string | null;
  parLevel: number | null;
  quantityOnHand: number;
  checkouts: OpenCheckout[];
}

export default function ToolCribPage() {
  const t = useTranslations("toolCrib");
  const tc = useTranslations("common");
  const { data: me } = useMe();

  const [items, setItems] = useState<ToolCribItem[] | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", barcode: "", replacementCost: "", parLevel: "", quantityOnHand: "" });
  const [checkoutItemId, setCheckoutItemId] = useState<string | null>(null);
  const [checkoutForm, setCheckoutForm] = useState({ workerId: "", quantity: "1", notes: "" });
  const [checkInId, setCheckInId] = useState<string | null>(null);
  const [checkInForm, setCheckInForm] = useState({ returnCondition: "good" as ToolCheckoutCondition, chargeAmount: "", notes: "" });
  const [calibrationItemId, setCalibrationItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<ToolCribItem[]>("/tool-crib/items").then(setItems);
  }
  useEffect(() => {
    load();
    apiFetch<Worker[]>("/workers").then((w) => {
      setWorkers(w);
      if (w[0]) setCheckoutForm((f) => ({ ...f, workerId: w[0].id }));
    });
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/tool-crib/items", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          barcode: form.barcode || undefined,
          replacementCost: form.replacementCost ? Number(form.replacementCost) : undefined,
          parLevel: form.parLevel ? Number(form.parLevel) : undefined,
          quantityOnHand: form.quantityOnHand ? Number(form.quantityOnHand) : undefined,
        }),
      });
      setForm({ name: "", barcode: "", replacementCost: "", parLevel: "", quantityOnHand: "" });
      setAdding(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function checkOut(itemId: string) {
    if (!checkoutForm.workerId) return;
    setBusy(true);
    try {
      await apiFetch(`/tool-crib/items/${itemId}/check-out`, {
        method: "POST",
        body: JSON.stringify({
          workerId: checkoutForm.workerId,
          quantity: Number(checkoutForm.quantity) || 1,
          notes: checkoutForm.notes || undefined,
        }),
      });
      setCheckoutItemId(null);
      setCheckoutForm((f) => ({ ...f, quantity: "1", notes: "" }));
      load();
    } finally {
      setBusy(false);
    }
  }

  async function checkIn(checkoutId: string) {
    setBusy(true);
    try {
      await apiFetch(`/tool-checkouts/${checkoutId}/check-in`, {
        method: "POST",
        body: JSON.stringify({
          returnCondition: checkInForm.returnCondition,
          chargeAmount: checkInForm.chargeAmount ? Number(checkInForm.chargeAmount) : undefined,
          notes: checkInForm.notes || undefined,
        }),
      });
      setCheckInId(null);
      setCheckInForm({ returnCondition: "good", chargeAmount: "", notes: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthenticatedShell>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn-secondary px-2.5 py-1 text-xs">
            {t("addItem")}
          </button>
        )}
      </div>
      <p className="mb-6 text-sm text-gray-500">{t("hint")}</p>

      {adding && (
        <form onSubmit={create} className="card mb-6 flex flex-wrap items-end gap-2">
          <input
            required
            placeholder={t("namePlaceholder")}
            className="input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            placeholder={t("barcodePlaceholder")}
            className="input"
            value={form.barcode}
            onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
          />
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder={t("replacementCostPlaceholder")}
            className="input w-40"
            value={form.replacementCost}
            onChange={(e) => setForm((f) => ({ ...f, replacementCost: e.target.value }))}
          />
          <input
            type="number"
            min="0"
            placeholder={t("parLevelPlaceholder")}
            className="input w-32"
            value={form.parLevel}
            onChange={(e) => setForm((f) => ({ ...f, parLevel: e.target.value }))}
          />
          <input
            type="number"
            min="0"
            placeholder={t("quantityOnHandPlaceholder")}
            className="input w-32"
            value={form.quantityOnHand}
            onChange={(e) => setForm((f) => ({ ...f, quantityOnHand: e.target.value }))}
          />
          <button type="submit" disabled={busy} className="btn-primary">
            {tc("save")}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="btn-secondary">
            {tc("cancel")}
          </button>
        </form>
      )}

      {!items ? (
        <p className="text-sm text-gray-500">{tc("loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noItems")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const low = item.parLevel !== null && item.quantityOnHand < item.parLevel;
            return (
              <li key={item.id} className="card">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    {item.name}
                    {item.barcode && <span className="ml-1.5 text-xs text-gray-400">({item.barcode})</span>}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${low ? "bg-error-50 text-error-700" : "bg-gray-100 text-gray-600"}`}>
                    {t("onHandCount", { count: item.quantityOnHand })}
                    {low && ` · ${t("lowStock")}`}
                  </span>
                </div>

                {item.checkouts.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {item.checkouts.map((co) => (
                      <li key={co.id} className="flex items-center justify-between text-xs text-gray-500">
                        <span>
                          {t("checkedOutTo", { worker: co.worker.name, quantity: co.quantity })} ·{" "}
                          {formatDate(new Date(co.checkedOutAt))}
                        </span>
                        {checkInId === co.id ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              className="input py-0.5 text-xs"
                              value={checkInForm.returnCondition}
                              onChange={(e) => setCheckInForm((f) => ({ ...f, returnCondition: e.target.value as ToolCheckoutCondition }))}
                            >
                              {TOOL_CHECKOUT_CONDITIONS.map((c) => (
                                <option key={c} value={c}>
                                  {t(`condition_${c}`)}
                                </option>
                              ))}
                            </select>
                            {checkInForm.returnCondition !== "good" && (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder={t("chargeAmountPlaceholder", { currency: me?.company.currency ?? "" })}
                                className="input w-28 py-0.5 text-xs"
                                value={checkInForm.chargeAmount}
                                onChange={(e) => setCheckInForm((f) => ({ ...f, chargeAmount: e.target.value }))}
                              />
                            )}
                            <button onClick={() => checkIn(co.id)} disabled={busy} className="btn-primary px-2 py-0.5 text-xs">
                              {tc("save")}
                            </button>
                            <button onClick={() => setCheckInId(null)} className="btn-secondary px-2 py-0.5 text-xs">
                              {tc("cancel")}
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setCheckInId(co.id)} className="text-brand-700 hover:underline">
                            {t("checkIn")}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {checkoutItemId === item.id ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
                    <select
                      className="input"
                      value={checkoutForm.workerId}
                      onChange={(e) => setCheckoutForm((f) => ({ ...f, workerId: e.target.value }))}
                    >
                      {workers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      max={item.quantityOnHand}
                      placeholder={t("quantity")}
                      className="input w-24"
                      value={checkoutForm.quantity}
                      onChange={(e) => setCheckoutForm((f) => ({ ...f, quantity: e.target.value }))}
                    />
                    <button onClick={() => checkOut(item.id)} disabled={busy || item.quantityOnHand === 0} className="btn-primary px-2.5 py-1 text-xs">
                      {tc("save")}
                    </button>
                    <button onClick={() => setCheckoutItemId(null)} className="btn-secondary px-2.5 py-1 text-xs">
                      {tc("cancel")}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setCheckoutItemId(item.id)}
                    disabled={item.quantityOnHand === 0}
                    className="btn-secondary mt-3 px-2.5 py-1 text-xs disabled:opacity-40"
                  >
                    {t("checkOut")}
                  </button>
                )}

                <button
                  onClick={() => setCalibrationItemId(calibrationItemId === item.id ? null : item.id)}
                  className="ml-2 mt-3 text-xs text-brand-700 hover:underline"
                >
                  {t("calibration")}
                </button>
                {calibrationItemId === item.id && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <CalibrationPanel toolCribItemId={item.id} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AuthenticatedShell>
  );
}
