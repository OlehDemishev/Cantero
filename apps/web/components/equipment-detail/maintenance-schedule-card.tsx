"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { resetStateInEffect } from "@/lib/effect-reset";
import { formatDate } from "@/lib/format-date";
import { Field } from "@/components/ui/field";
import type { Equipment, EquipmentCardProps } from "./types";

function intervalDaysDraft(e: Equipment) {
  return e.maintenanceIntervalDays !== null ? String(e.maintenanceIntervalDays) : "";
}
function intervalHoursDraft(e: Equipment) {
  return e.maintenanceIntervalHours !== null ? e.maintenanceIntervalHours : "";
}
function meterReadingDraft(e: Equipment) {
  return e.currentMeterHours !== null ? e.currentMeterHours : "";
}

/** Maintenance by calendar interval and by meter hours, and the current meter reading. */
export function MaintenanceScheduleCard({ equipmentId, equipment, busy, setBusy, setError, reload }: EquipmentCardProps) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const [scheduleIntervalDays, setScheduleIntervalDays] = useState(intervalDaysDraft(equipment));
  const [scheduleIntervalHours, setScheduleIntervalHours] = useState(intervalHoursDraft(equipment));
  const [meterReading, setMeterReading] = useState(meterReadingDraft(equipment));

  // Every load of the equipment starts the inputs from what is saved.
  useEffect(() => {
    resetStateInEffect(() => {
      setScheduleIntervalDays(intervalDaysDraft(equipment));
      setScheduleIntervalHours(intervalHoursDraft(equipment));
      setMeterReading(meterReadingDraft(equipment));
    });
  }, [equipment]);

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/equipment/${equipmentId}/maintenance-schedule`, {
        method: "PATCH",
        body: JSON.stringify({ intervalDays: scheduleIntervalDays ? Number(scheduleIntervalDays) : null }),
      });
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function clearSchedule() {
    setBusy(true);
    try {
      await apiFetch(`/equipment/${equipmentId}/maintenance-schedule`, { method: "PATCH", body: JSON.stringify({ intervalDays: null }) });
      setScheduleIntervalDays("");
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function saveHoursSchedule(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/equipment/${equipmentId}/maintenance-schedule`, {
        method: "PATCH",
        body: JSON.stringify({ intervalHours: scheduleIntervalHours ? Number(scheduleIntervalHours) : null }),
      });
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function clearHoursSchedule() {
    setBusy(true);
    try {
      await apiFetch(`/equipment/${equipmentId}/maintenance-schedule`, { method: "PATCH", body: JSON.stringify({ intervalHours: null }) });
      setScheduleIntervalHours("");
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function saveMeterReading(e: React.FormEvent) {
    e.preventDefault();
    if (!meterReading) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/equipment/${equipmentId}/meter-reading`, {
        method: "PATCH",
        body: JSON.stringify({ currentMeterHours: Number(meterReading) }),
      });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("maintenanceSchedule")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("maintenanceScheduleHint")}</p>
      {equipment.nextMaintenanceDueAt && (
        <p
          className={`mb-3 text-sm ${
            new Date(equipment.nextMaintenanceDueAt) < new Date() ? "font-medium text-danger-fg" : "text-fg-muted"
          }`}
        >
          {t("nextDue", { date: formatDate(new Date(equipment.nextMaintenanceDueAt)) })}
        </p>
      )}
      <form onSubmit={saveSchedule} className="flex flex-wrap items-end gap-2">
        <Field label={t("intervalDays")} size="sm">
          <input
            type="number"
            min="1"
            max="3650"
            placeholder={t("intervalDaysPlaceholder")}
            className="input w-32"
            value={scheduleIntervalDays}
            onChange={(e) => setScheduleIntervalDays(e.target.value)}
          />
        </Field>
        <button type="submit" disabled={busy} className="btn-secondary">
          {tc("save")}
        </button>
        {equipment.maintenanceIntervalDays !== null && (
          <button type="button" onClick={clearSchedule} disabled={busy} className="btn-secondary">
            {t("disableSchedule")}
          </button>
        )}
      </form>

      <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
        <p className="mb-2 text-sm text-fg-muted">
          {t("currentMeterHours")}: {equipment.currentMeterHours ?? "—"}
          {equipment.nextMaintenanceDueHours !== null && (
            <span
              className={
                Number(equipment.currentMeterHours ?? 0) >= Number(equipment.nextMaintenanceDueHours)
                  ? "ml-2 font-medium text-danger-fg"
                  : "ml-2 text-fg-subtle"
              }
            >
              {t("nextDueHours", { hours: equipment.nextMaintenanceDueHours })}
            </span>
          )}
        </p>
        <form onSubmit={saveMeterReading} className="mb-3 flex flex-wrap items-end gap-2">
          <Field label={t("updateMeterReading")} size="sm">
            <input
              type="number"
              min="0"
              step="0.1"
              className="input w-32"
              value={meterReading}
              onChange={(e) => setMeterReading(e.target.value)}
            />
          </Field>
          <button type="submit" disabled={busy} className="btn-secondary">
            {tc("save")}
          </button>
        </form>
        <form onSubmit={saveHoursSchedule} className="flex flex-wrap items-end gap-2">
          <Field label={t("intervalHours")} size="sm">
            <input
              type="number"
              min="1"
              step="1"
              placeholder={t("intervalHoursPlaceholder")}
              className="input w-32"
              value={scheduleIntervalHours}
              onChange={(e) => setScheduleIntervalHours(e.target.value)}
            />
          </Field>
          <button type="submit" disabled={busy} className="btn-secondary">
            {tc("save")}
          </button>
          {equipment.maintenanceIntervalHours !== null && (
            <button type="button" onClick={clearHoursSchedule} disabled={busy} className="btn-secondary">
              {t("disableSchedule")}
            </button>
          )}
        </form>
      </div>
    </section>
  );
}
