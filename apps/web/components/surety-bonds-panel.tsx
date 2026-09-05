"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SURETY_BOND_TYPES, type SuretyBondStatus, type SuretyBondType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatDate } from "@/lib/format-date";

interface SuretyBond {
  id: string;
  type: SuretyBondType;
  bondNumber: string | null;
  suretyName: string;
  penalSum: string;
  issueDate: string;
  expiryDate: string | null;
  status: SuretyBondStatus;
}

const STATUS_STYLES: Record<SuretyBondStatus, string> = {
  active: "bg-success-50 text-success-700",
  released: "bg-gray-100 text-gray-600",
  expired: "bg-error-50 text-error-700",
};

export function SuretyBondsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("suretyBonds");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [bonds, setBonds] = useState<SuretyBond[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ type: "performance" as SuretyBondType, suretyName: "", bondNumber: "", penalSum: "", issueDate: "", expiryDate: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<SuretyBond[]>(`/surety-bonds?projectId=${projectId}`).then(setBonds);
  }
  useEffect(load, [projectId]);

  async function createBond(e: React.FormEvent) {
    e.preventDefault();
    if (!form.suretyName.trim() || !form.penalSum || !form.issueDate) return;
    setBusy(true);
    try {
      await apiFetch("/surety-bonds", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          type: form.type,
          suretyName: form.suretyName.trim(),
          bondNumber: form.bondNumber || undefined,
          penalSum: Number(form.penalSum),
          issueDate: new Date(form.issueDate).toISOString(),
          expiryDate: form.expiryDate ? new Date(form.expiryDate).toISOString() : undefined,
        }),
      });
      setForm({ type: "performance", suretyName: "", bondNumber: "", penalSum: "", issueDate: "", expiryDate: "" });
      setAdding(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function release(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/surety-bonds/${id}/release`, { method: "POST" });
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
            {t("addBond")}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500">{t("hint")}</p>

      {adding && (
        <form onSubmit={createBond} className="card mb-3 flex flex-wrap items-end gap-2">
          <select className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as SuretyBondType }))}>
            {SURETY_BOND_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`type_${type}`)}
              </option>
            ))}
          </select>
          <input
            required
            placeholder={t("suretyNamePlaceholder")}
            className="input"
            value={form.suretyName}
            onChange={(e) => setForm((f) => ({ ...f, suretyName: e.target.value }))}
          />
          <input
            placeholder={t("bondNumberPlaceholder")}
            className="input"
            value={form.bondNumber}
            onChange={(e) => setForm((f) => ({ ...f, bondNumber: e.target.value }))}
          />
          <input
            required
            type="number"
            step="0.01"
            min="0"
            placeholder={t("penalSumPlaceholder", { currency })}
            className="input w-40"
            value={form.penalSum}
            onChange={(e) => setForm((f) => ({ ...f, penalSum: e.target.value }))}
          />
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            {t("issueDate")}
            <input
              required
              type="date"
              className="input"
              value={form.issueDate}
              onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            {t("expiryDate")}
            <input
              type="date"
              className="input"
              value={form.expiryDate}
              onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
            />
          </label>
          <button type="submit" disabled={busy} className="btn-primary">
            {tc("save")}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="btn-secondary">
            {tc("cancel")}
          </button>
        </form>
      )}

      {!bonds ? (
        <p className="text-sm text-gray-500">{tc("loading")}</p>
      ) : bonds.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noBonds")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bonds.map((bond) => (
            <li key={bond.id} className="card">
              <div className="flex items-center justify-between">
                <div className="font-medium">
                  {t(`type_${bond.type}`)} · {bond.suretyName}
                  {bond.bondNumber && <span className="ml-1 text-xs text-gray-400">({bond.bondNumber})</span>}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[bond.status]}`}>{t(`status_${bond.status}`)}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {t("penalSum")}: {bond.penalSum} {currency} · {t("issueDate")}: {formatDate(new Date(bond.issueDate))}
                {bond.expiryDate && ` · ${t("expiryDate")}: ${formatDate(new Date(bond.expiryDate))}`}
              </p>
              {bond.status === "active" && (
                <button onClick={() => release(bond.id)} disabled={busy} className="btn-secondary mt-2 px-2 py-1 text-xs">
                  {t("releaseBond")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
