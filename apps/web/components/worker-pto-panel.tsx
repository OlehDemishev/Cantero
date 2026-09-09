"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

/** `onChanged` lets the parent refresh the header's PTO balance number after an adjustment. */
export function WorkerPtoPanel({ workerId, onChanged }: { workerId: string; onChanged: () => void }) {
  const t = useTranslations("team");
  const [ptoForm, setPtoForm] = useState({ deltaHours: "", reason: "" });
  const [ptoBusy, setPtoBusy] = useState(false);

  async function adjustPto(e: React.FormEvent) {
    e.preventDefault();
    const deltaHours = Number(ptoForm.deltaHours);
    if (!deltaHours || !ptoForm.reason) return;
    setPtoBusy(true);
    try {
      await apiFetch(`/workers/${workerId}/pto-balance/adjust`, {
        method: "POST",
        body: JSON.stringify({ deltaHours, reason: ptoForm.reason }),
      });
      setPtoForm({ deltaHours: "", reason: "" });
      onChanged();
    } finally {
      setPtoBusy(false);
    }
  }

  return (
    <>
      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{t("ptoBalance")}</h2>
      <form onSubmit={adjustPto} className="card flex flex-col gap-2">
        <input
          required
          type="number"
          step="0.5"
          placeholder={t("ptoDeltaHoursPlaceholder")}
          className="input"
          value={ptoForm.deltaHours}
          onChange={(e) => setPtoForm((f) => ({ ...f, deltaHours: e.target.value }))}
        />
        <input
          required
          placeholder={t("ptoReasonPlaceholder")}
          className="input"
          value={ptoForm.reason}
          onChange={(e) => setPtoForm((f) => ({ ...f, reason: e.target.value }))}
        />
        <button type="submit" disabled={ptoBusy} className="btn-secondary self-start">
          {t("adjustPtoBalance")}
        </button>
      </form>
    </>
  );
}
