"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SUPPORTED_LOCALES } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";

interface WageClassification {
  id: string;
  trade: string;
}
interface WorkerProfile {
  name: string;
  role: string | null;
  hourlyCost: string | null;
  wageClassificationId: string | null;
  phone: string | null;
  preferredLocale: string | null;
  payrollEmployeeId: string | null;
  isApprentice: boolean;
  active: boolean;
  hasClockInPin: boolean;
}

/** Manager-only worker editing: profile fields, active toggle, and the kiosk clock-in PIN.
 * `onChanged` lets the parent refresh the header stats (name/role/active) after a save. */
export function WorkerProfilePanel({ workerId, currency, onChanged }: { workerId: string; currency: string; onChanged: () => void }) {
  const t = useTranslations("team");
  const tc = useTranslations("common");

  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [form, setForm] = useState({
    name: "",
    role: "",
    hourlyCost: "",
    wageClassificationId: "",
    phone: "",
    preferredLocale: "",
    payrollEmployeeId: "",
    isApprentice: false,
  });
  const [wageClassifications, setWageClassifications] = useState<WageClassification[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pinDraft, setPinDraft] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  function load() {
    apiFetch<{ worker: WorkerProfile }>(`/workers/${workerId}/summary`).then(({ worker: w }) => {
      setWorker(w);
      setForm({
        name: w.name,
        role: w.role ?? "",
        hourlyCost: w.hourlyCost ?? "",
        wageClassificationId: w.wageClassificationId ?? "",
        phone: w.phone ?? "",
        preferredLocale: w.preferredLocale ?? "",
        payrollEmployeeId: w.payrollEmployeeId ?? "",
        isApprentice: w.isApprentice,
      });
    });
    apiFetch<WageClassification[]>("/wage-classifications").then(setWageClassifications);
  }

  useEffect(load, [workerId]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    try {
      await apiFetch(`/workers/${workerId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          role: form.role || null,
          hourlyCost: form.hourlyCost ? Number(form.hourlyCost) : null,
          wageClassificationId: form.wageClassificationId || null,
          phone: form.phone || null,
          preferredLocale: form.preferredLocale || null,
          payrollEmployeeId: form.payrollEmployeeId || null,
          isApprentice: form.isApprentice,
        }),
      });
      setSaved(true);
      load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!worker) return;
    setBusy(true);
    try {
      await apiFetch(`/workers/${workerId}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !worker.active }),
      });
      load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function setClockInPin(e: React.FormEvent) {
    e.preventDefault();
    setPinBusy(true);
    setPinError(null);
    try {
      await apiFetch(`/workers/${workerId}/clock-in-pin`, { method: "PATCH", body: JSON.stringify({ pin: pinDraft }) });
      setPinDraft("");
      load();
    } catch (err) {
      setPinError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setPinBusy(false);
    }
  }

  async function clearClockInPin() {
    setPinBusy(true);
    try {
      await apiFetch(`/workers/${workerId}/clock-in-pin`, { method: "DELETE" });
      load();
    } finally {
      setPinBusy(false);
    }
  }

  if (!worker) return null;

  return (
    <>
      <form onSubmit={saveProfile} className="card flex flex-col gap-3">
        <input
          required
          placeholder={tc("name")}
          className="input"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          placeholder={t("role")}
          className="input"
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
        />
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("hourlyCost")} ({currency})
          <input
            type="number"
            step="0.01"
            className="input mt-1"
            value={form.hourlyCost}
            onChange={(e) => setForm((f) => ({ ...f, hourlyCost: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("payrollEmployeeId")}
          <input
            placeholder={t("payrollEmployeeIdPlaceholder")}
            className="input mt-1"
            value={form.payrollEmployeeId}
            onChange={(e) => setForm((f) => ({ ...f, payrollEmployeeId: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("wageClassification")}
          <select
            className="input mt-1"
            value={form.wageClassificationId}
            onChange={(e) => setForm((f) => ({ ...f, wageClassificationId: e.target.value }))}
          >
            <option value="">{t("unclassified")}</option>
            {wageClassifications?.map((wc) => (
              <option key={wc.id} value={wc.id}>
                {wc.trade}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <input type="checkbox" checked={form.isApprentice} onChange={(e) => setForm((f) => ({ ...f, isApprentice: e.target.checked }))} />
          {t("isApprentice")}
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("phone")}
          <input
            type="tel"
            placeholder={t("phonePlaceholder")}
            className="input mt-1"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("preferredLocale")}
          <select
            className="input mt-1"
            value={form.preferredLocale}
            onChange={(e) => setForm((f) => ({ ...f, preferredLocale: e.target.value }))}
          >
            <option value="">{t("preferredLocaleDefault")}</option>
            {SUPPORTED_LOCALES.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button type="submit" disabled={busy} className="btn-primary">
            {tc("save")}
          </button>
          {saved && <span className="text-xs text-success-700 dark:text-success-500">{tc("saved")}</span>}
        </div>
      </form>
      <button onClick={toggleActive} disabled={busy} className="btn-secondary mt-3 w-full">
        {worker.active ? t("deactivate") : t("reactivate")}
      </button>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("kioskPin")}</h2>
      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("kioskPinHint")}</p>
      {worker.hasClockInPin ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-success-700 dark:text-success-500">{t("kioskPinSet")}</span>
          <button onClick={clearClockInPin} disabled={pinBusy} className="text-xs text-error-700 dark:text-error-500 hover:underline">
            {t("kioskPinClear")}
          </button>
        </div>
      ) : (
        <form onSubmit={setClockInPin} className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{4,6}"
            placeholder={t("kioskPinPlaceholder")}
            className="input flex-1"
            value={pinDraft}
            onChange={(e) => setPinDraft(e.target.value)}
          />
          <button type="submit" disabled={pinBusy || pinDraft.length < 4} className="btn-secondary shrink-0">
            {t("kioskPinSave")}
          </button>
        </form>
      )}
      {pinError && <p className="mt-1 text-xs text-error-700 dark:text-error-500">{pinError}</p>}
    </>
  );
}
