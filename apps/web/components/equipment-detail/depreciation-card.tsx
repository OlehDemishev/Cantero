"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DEPRECIATION_METHODS, type DepreciationMethod } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { resetStateInEffect } from "@/lib/effect-reset";
import { formatDate } from "@/lib/format-date";
import { formatCurrency } from "@/lib/format-currency";
import { Field } from "@/components/ui/field";
import type { Equipment, EquipmentCardProps } from "./types";

function depreciationDraft(e: Equipment) {
  return {
    method: (e.depreciationMethod ?? "") as DepreciationMethod | "",
    usefulLifeMonths: e.usefulLifeMonths !== null ? String(e.usefulLifeMonths) : "",
    salvageValue: e.salvageValue !== null ? e.salvageValue : "",
  };
}

/** Book value and the depreciation schedule, or the disposal once the equipment is gone. */
export function DepreciationCard({ equipmentId, equipment, currency, busy, setBusy, setError, reload }: EquipmentCardProps) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");
  const [depreciationForm, setDepreciationForm] = useState(depreciationDraft(equipment));
  const [disposeForm, setDisposeForm] = useState({ saleAmount: "", notes: "" });
  const [disposing, setDisposing] = useState(false);

  // Every load of the equipment starts the schedule inputs from what is saved.
  useEffect(() => {
    resetStateInEffect(() => setDepreciationForm(depreciationDraft(equipment)));
  }, [equipment]);

  async function saveDepreciationSchedule(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/equipment/${equipmentId}/depreciation-schedule`, {
        method: "PATCH",
        body: JSON.stringify({
          depreciationMethod: depreciationForm.method || null,
          usefulLifeMonths: depreciationForm.usefulLifeMonths ? Number(depreciationForm.usefulLifeMonths) : null,
          salvageValue: depreciationForm.salvageValue ? Number(depreciationForm.salvageValue) : null,
        }),
      });
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function dispose(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/equipment/${equipmentId}/dispose`, {
        method: "POST",
        body: JSON.stringify({
          saleAmount: disposeForm.saleAmount ? Number(disposeForm.saleAmount) : undefined,
          notes: disposeForm.notes || undefined,
        }),
      });
      setDisposing(false);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("depreciation")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("depreciationHint")}</p>

      {equipment.disposal ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t("disposedOn", { date: formatDate(new Date(equipment.disposal.disposedAt)) })}
          {equipment.disposal.saleAmount !== null && (
            <span className="block text-xs text-fg-subtle">
              {t("saleAmount")}: {formatCurrency(equipment.disposal.saleAmount, currency)}
            </span>
          )}
        </p>
      ) : (
        <>
          {equipment.depreciation && (
            <p className="mb-3 text-sm text-fg-muted">
              {t("bookValue")}: <span className="font-medium">{formatCurrency(equipment.depreciation.bookValue, currency)}</span>
              <span className="ml-2 text-xs text-fg-subtle">
                ({t("accumulatedDepreciation")}: {formatCurrency(equipment.depreciation.accumulatedDepreciation, currency)})
              </span>
            </p>
          )}
          <form onSubmit={saveDepreciationSchedule} className="flex flex-wrap items-end gap-2">
            <select aria-label={ta("depreciationMethod")}
              className="input"
              value={depreciationForm.method}
              onChange={(e) => setDepreciationForm((f) => ({ ...f, method: e.target.value as DepreciationMethod }))}
            >
              <option value="">{t("noDepreciationMethod")}</option>
              {DEPRECIATION_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`depreciationMethod_${m}`)}
                </option>
              ))}
            </select>
            <Field label={t("usefulLifeMonths")} size="sm">
              <input
                type="number"
                min="1"
                max="600"
                className="input w-32"
                value={depreciationForm.usefulLifeMonths}
                onChange={(e) => setDepreciationForm((f) => ({ ...f, usefulLifeMonths: e.target.value }))}
              />
            </Field>
            <Field label={t("salvageValue")} size="sm">
              <input
                type="number"
                step="0.01"
                min="0"
                className="input w-32"
                value={depreciationForm.salvageValue}
                onChange={(e) => setDepreciationForm((f) => ({ ...f, salvageValue: e.target.value }))}
              />
            </Field>
            <button type="submit" disabled={busy} className="btn-secondary">
              {tc("save")}
            </button>
          </form>

          {equipment.status !== "in_use" && equipment.status !== "rented_out" && (
            <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4">
              {!disposing ? (
                <button onClick={() => setDisposing(true)} className="btn-secondary px-3 py-1.5 text-xs">
                  {t("disposeOfEquipment")}
                </button>
              ) : (
                <form onSubmit={dispose} className="flex flex-wrap items-end gap-2">
                  <Field label={t("saleAmount")} size="sm">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input w-32"
                      value={disposeForm.saleAmount}
                      onChange={(e) => setDisposeForm((f) => ({ ...f, saleAmount: e.target.value }))}
                    />
                  </Field>
                  <input
                    placeholder={t("disposalNotesPlaceholder")} aria-label={t("disposalNotesPlaceholder")}
                    className="input"
                    value={disposeForm.notes}
                    onChange={(e) => setDisposeForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                  <button type="submit" disabled={busy} className="btn-primary">
                    {t("confirmDisposal")}
                  </button>
                  <button type="button" onClick={() => setDisposing(false)} className="btn-secondary">
                    {tc("cancel")}
                  </button>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
