"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { AllowanceStatus } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatCurrency } from "@/lib/format-currency";

interface AllowanceCharge {
  id: string;
  description: string;
  amount: number;
  chargedAt: string;
  createdByName: string | null;
}
interface Allowance {
  id: string;
  name: string;
  budgetedAmount: number;
  notes: string | null;
  status: AllowanceStatus;
  charges: AllowanceCharge[];
}

const STATUS_STYLES: Record<AllowanceStatus, string> = {
  active: "bg-gray-100 text-gray-600",
  exceeded: "bg-error-50 text-error-700",
  closed: "bg-success-50 text-success-700",
};

export function AllowancesPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("allowances");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "USD";
  const money = (amount: number | string) => formatCurrency(amount, currency, me?.company.locale);

  const [allowances, setAllowances] = useState<Allowance[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", budgetedAmount: "", notes: "" });
  const [chargeForms, setChargeForms] = useState<Record<string, { description: string; amount: string }>>({});
  const [chargingId, setChargingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Allowance[]>(`/projects/${projectId}/allowances`).then(setAllowances);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/allowances`, {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          budgetedAmount: Number(form.budgetedAmount),
          notes: form.notes || undefined,
        }),
      });
      setForm({ name: "", budgetedAmount: "", notes: "" });
      setCreating(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function submitCharge(e: React.FormEvent, allowanceId: string) {
    e.preventDefault();
    const draft = chargeForms[allowanceId];
    if (!draft) return;
    setBusy(true);
    try {
      await apiFetch(`/allowances/${allowanceId}/charges`, {
        method: "POST",
        body: JSON.stringify({ description: draft.description, amount: Number(draft.amount) }),
      });
      setChargeForms((f) => ({ ...f, [allowanceId]: { description: "", amount: "" } }));
      setChargingId(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function close(id: string) {
    await apiFetch(`/allowances/${id}/close`, { method: "POST" });
    load();
  }

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{t("title")}</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newAllowance")}
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={submit} className="card mb-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("name")}</span>
            <input required className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label className="flex w-48 flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("budgetedAmount")}</span>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={form.budgetedAmount}
              onChange={(e) => setForm((f) => ({ ...f, budgetedAmount: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("notes")}</span>
            <textarea rows={2} className="input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
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

      {allowances === null ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : allowances.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noAllowances")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {allowances.map((a) => {
            const spent = a.charges.reduce((sum, c) => sum + Number(c.amount), 0);
            const draft = chargeForms[a.id] ?? { description: "", amount: "" };
            return (
              <li key={a.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{a.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[a.status]}`}>{t(a.status)}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {t("spentOfBudget", { spent: money(spent), budget: money(a.budgetedAmount) })}
                    </p>
                    {a.notes && <p className="mt-1 text-xs text-gray-500">{a.notes}</p>}
                  </div>
                  {a.status !== "closed" && (
                    <button onClick={() => close(a.id)} className="btn-secondary shrink-0 px-2.5 py-1 text-xs">
                      {t("closeAllowance")}
                    </button>
                  )}
                </div>

                {a.charges.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1 border-t border-gray-100 pt-3">
                    {a.charges.map((c) => (
                      <li key={c.id} className="flex items-center justify-between text-xs text-gray-600">
                        <span>{c.description}</span>
                        <span className="font-medium tabular-nums">{money(c.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {a.status !== "closed" &&
                  (chargingId === a.id ? (
                    <form
                      onSubmit={(e) => submitCharge(e, a.id)}
                      className="mt-3 flex items-end gap-2 border-t border-gray-100 pt-3"
                    >
                      <label className="flex flex-1 flex-col gap-1 text-xs">
                        <span className="font-medium text-gray-700">{t("chargeDescription")}</span>
                        <input
                          required
                          className="input py-1 text-xs"
                          value={draft.description}
                          onChange={(e) => setChargeForms((f) => ({ ...f, [a.id]: { ...draft, description: e.target.value } }))}
                        />
                      </label>
                      <label className="flex w-28 flex-col gap-1 text-xs">
                        <span className="font-medium text-gray-700">{t("chargeAmount")}</span>
                        <input
                          required
                          type="number"
                          min="0"
                          step="0.01"
                          className="input py-1 text-xs"
                          value={draft.amount}
                          onChange={(e) => setChargeForms((f) => ({ ...f, [a.id]: { ...draft, amount: e.target.value } }))}
                        />
                      </label>
                      <button type="submit" disabled={busy} className="btn-primary px-2.5 py-1 text-xs">
                        {tc("save")}
                      </button>
                      <button type="button" onClick={() => setChargingId(null)} className="btn-secondary px-2.5 py-1 text-xs">
                        {tc("cancel")}
                      </button>
                    </form>
                  ) : (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <button onClick={() => setChargingId(a.id)} className="btn-secondary px-2.5 py-1 text-xs">
                        {t("addCharge")}
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
