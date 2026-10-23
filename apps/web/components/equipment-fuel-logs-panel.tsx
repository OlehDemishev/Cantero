"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { useCan } from "@/lib/permissions";
import { formatDate } from "@/lib/format-date";
import { formatCurrency } from "@/lib/format-currency";

interface Supplier {
  id: string;
  name: string;
}
interface FuelLog {
  id: string;
  filledAt: string;
  quantity: string;
  cost: string | null;
  meterHours: string | null;
  supplier: { id: string; name: string } | null;
}
interface CostPerHour {
  totalCost: number;
  costPerHour: number | null;
}
interface Tco {
  totalCost: number;
  costPerHour: number | null;
  fuelSharePercent: number | null;
  maintenanceSharePercent: number | null;
  depreciationSharePercent: number | null;
}

export function EquipmentFuelLogsPanel({ equipmentId, currency }: { equipmentId: string; currency: string }) {
  const t = useTranslations("equipment");
  const { data: fuelLogs = null, reload: reloadFuelLogs } = useApi<FuelLog[]>(`/equipment/${equipmentId}/fuel-logs`);
  const canSeeSuppliers = useCan()("purchasing.view");
  const { data: suppliers = [] } = useApi<Supplier[]>(canSeeSuppliers ? "/materials/suppliers" : null);
  const { data: costPerHour = null, reload: reloadCostPerHour } = useApi<CostPerHour>(`/equipment/${equipmentId}/cost-per-hour`);
  const { data: tco = null, reload: reloadTco } = useApi<Tco>(`/equipment/${equipmentId}/tco`);
  const [fuelForm, setFuelForm] = useState({ quantity: "", cost: "", supplierId: "", meterHours: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadFuelLogs();
    void reloadCostPerHour();
    void reloadTco();
  }

  async function addFuelLog(e: React.FormEvent) {
    e.preventDefault();
    if (!fuelForm.quantity) return;
    setBusy(true);
    try {
      await apiFetch(`/equipment/${equipmentId}/fuel-logs`, {
        method: "POST",
        body: JSON.stringify({
          quantity: Number(fuelForm.quantity),
          cost: fuelForm.cost ? Number(fuelForm.cost) : undefined,
          supplierId: fuelForm.supplierId || undefined,
          meterHours: fuelForm.meterHours ? Number(fuelForm.meterHours) : undefined,
        }),
      });
      setFuelForm({ quantity: "", cost: "", supplierId: "", meterHours: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("fuelLogs")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("fuelLogsHint")}</p>
      {costPerHour && (
        <p className="mb-3 text-sm text-fg-muted">
          {t("costPerHour")}: {costPerHour.costPerHour !== null ? `${formatCurrency(costPerHour.costPerHour, currency)}/${t("hoursAbbr")}` : "—"}
          <span className="ml-2 text-xs text-fg-subtle">
            ({t("totalCost")}: {formatCurrency(costPerHour.totalCost, currency)})
          </span>
        </p>
      )}
      {tco && (
        <div className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-sm text-fg-muted dark:bg-gray-800">
          <span className="font-medium">
            {t("tco")}: {formatCurrency(tco.totalCost, currency)}
          </span>
          {tco.totalCost > 0 && (
            <span className="ml-2 text-xs text-fg-subtle">
              ({t("tcoBreakdown", {
                fuel: tco.fuelSharePercent ?? 0,
                maintenance: tco.maintenanceSharePercent ?? 0,
                depreciation: tco.depreciationSharePercent ?? 0,
              })})
            </span>
          )}
        </div>
      )}
      {!fuelLogs || fuelLogs.length === 0 ? (
        <p className="mb-3 text-sm text-fg-subtle">{t("noFuelLogs")}</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2">
          {fuelLogs.map((f) => (
            <li key={f.id} className="border-b border-gray-100 dark:border-gray-700 pb-2 text-sm">
              <div className="flex justify-between">
                <span>{f.quantity}</span>
                {f.cost && (
                  <span className="text-fg-subtle">
                    {formatCurrency(f.cost, currency)}
                  </span>
                )}
              </div>
              <span className="text-xs text-fg-subtle">
                {formatDate(new Date(f.filledAt))}
                {f.supplier && ` · ${f.supplier.name}`}
                {f.meterHours && ` · ${f.meterHours}${t("hoursAbbr")}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={addFuelLog} className="flex flex-wrap gap-2">
        <input
          required
          type="number"
          step="0.01"
          min="0.01"
          placeholder={t("quantityPlaceholder")}
          className="input w-32"
          value={fuelForm.quantity}
          onChange={(e) => setFuelForm((f) => ({ ...f, quantity: e.target.value }))}
        />
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder={t("cost")}
          className="input"
          value={fuelForm.cost}
          onChange={(e) => setFuelForm((f) => ({ ...f, cost: e.target.value }))}
        />
        <input
          type="number"
          step="0.1"
          min="0"
          placeholder={t("meterHoursPlaceholder")}
          className="input w-32"
          value={fuelForm.meterHours}
          onChange={(e) => setFuelForm((f) => ({ ...f, meterHours: e.target.value }))}
        />
        <select className="input" value={fuelForm.supplierId} onChange={(e) => setFuelForm((f) => ({ ...f, supplierId: e.target.value }))}>
          <option value="">{t("noSupplier")}</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={busy} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
          {t("addFuelLog")}
        </button>
      </form>
    </section>
  );
}
