"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

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
  const [fuelLogs, setFuelLogs] = useState<FuelLog[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [costPerHour, setCostPerHour] = useState<CostPerHour | null>(null);
  const [tco, setTco] = useState<Tco | null>(null);
  const [fuelForm, setFuelForm] = useState({ quantity: "", cost: "", supplierId: "", meterHours: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<FuelLog[]>(`/equipment/${equipmentId}/fuel-logs`).then(setFuelLogs);
    apiFetch<CostPerHour>(`/equipment/${equipmentId}/cost-per-hour`).then(setCostPerHour);
    apiFetch<Tco>(`/equipment/${equipmentId}/tco`).then(setTco);
  }

  useEffect(() => {
    load();
    apiFetch<Supplier[]>("/materials/suppliers").then(setSuppliers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentId]);

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
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("fuelLogs")}</h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("fuelLogsHint")}</p>
      {costPerHour && (
        <p className="mb-3 text-sm text-gray-700 dark:text-gray-300">
          {t("costPerHour")}: {costPerHour.costPerHour !== null ? `${costPerHour.costPerHour} ${currency}/${t("hoursAbbr")}` : "—"}
          <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
            ({t("totalCost")}: {costPerHour.totalCost} {currency})
          </span>
        </p>
      )}
      {tco && (
        <div className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <span className="font-medium">
            {t("tco")}: {tco.totalCost} {currency}
          </span>
          {tco.totalCost > 0 && (
            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
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
        <p className="mb-3 text-sm text-gray-400 dark:text-gray-500">{t("noFuelLogs")}</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2">
          {fuelLogs.map((f) => (
            <li key={f.id} className="border-b border-gray-100 dark:border-gray-700 pb-2 text-sm">
              <div className="flex justify-between">
                <span>{f.quantity}</span>
                {f.cost && (
                  <span className="text-gray-500 dark:text-gray-400">
                    {f.cost} {currency}
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500">
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
