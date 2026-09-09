"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface Supplier {
  id: string;
  name: string;
}
interface MaintenanceRecord {
  id: string;
  description: string;
  cost: string | null;
  performedAt: string;
  meterHours: string | null;
  supplier: { id: string; name: string } | null;
}

export function EquipmentMaintenanceRecordsPanel({ equipmentId, currency }: { equipmentId: string; currency: string }) {
  const t = useTranslations("equipment");
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [maintenanceForm, setMaintenanceForm] = useState({ description: "", cost: "", supplierId: "", meterHours: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<MaintenanceRecord[]>(`/equipment/${equipmentId}/maintenance-records`).then(setMaintenanceRecords);
  }

  useEffect(() => {
    load();
    apiFetch<Supplier[]>("/materials/suppliers").then(setSuppliers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentId]);

  async function addMaintenanceRecord(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/equipment/${equipmentId}/maintenance-records`, {
        method: "POST",
        body: JSON.stringify({
          description: maintenanceForm.description,
          cost: maintenanceForm.cost ? Number(maintenanceForm.cost) : undefined,
          supplierId: maintenanceForm.supplierId || undefined,
          meterHours: maintenanceForm.meterHours ? Number(maintenanceForm.meterHours) : undefined,
        }),
      });
      setMaintenanceForm({ description: "", cost: "", supplierId: "", meterHours: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("maintenanceRecords")}</h2>
      {!maintenanceRecords || maintenanceRecords.length === 0 ? (
        <p className="mb-3 text-sm text-gray-400 dark:text-gray-500">{t("noMaintenanceRecords")}</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2">
          {maintenanceRecords.map((r) => (
            <li key={r.id} className="border-b border-gray-100 dark:border-gray-700 pb-2 text-sm">
              <div className="flex justify-between">
                <span>{r.description}</span>
                {r.cost && (
                  <span className="text-gray-500 dark:text-gray-400">
                    {r.cost} {currency}
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {formatDate(new Date(r.performedAt))}
                {r.supplier && ` · ${r.supplier.name}`}
                {r.meterHours && ` · ${r.meterHours}${t("hoursAbbr")}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={addMaintenanceRecord} className="flex flex-col gap-2">
        <input
          required
          placeholder={t("descriptionPlaceholder")}
          className="input"
          value={maintenanceForm.description}
          onChange={(e) => setMaintenanceForm((f) => ({ ...f, description: e.target.value }))}
        />
        <div className="flex flex-wrap gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder={t("cost")}
            className="input"
            value={maintenanceForm.cost}
            onChange={(e) => setMaintenanceForm((f) => ({ ...f, cost: e.target.value }))}
          />
          <input
            type="number"
            step="0.1"
            min="0"
            placeholder={t("meterHoursPlaceholder")}
            className="input w-32"
            value={maintenanceForm.meterHours}
            onChange={(e) => setMaintenanceForm((f) => ({ ...f, meterHours: e.target.value }))}
          />
          <select
            className="input"
            value={maintenanceForm.supplierId}
            onChange={(e) => setMaintenanceForm((f) => ({ ...f, supplierId: e.target.value }))}
          >
            <option value="">{t("noSupplier")}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
            {t("addMaintenanceRecord")}
          </button>
        </div>
      </form>
    </section>
  );
}
