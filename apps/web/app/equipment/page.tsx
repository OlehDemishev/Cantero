"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { EquipmentStatus } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface AssignmentSummary {
  project: { id: string; name: string } | null;
  worker: { id: string; name: string } | null;
}
interface Equipment {
  id: string;
  name: string;
  category: string;
  serialNumber: string | null;
  purchaseCost: string | null;
  status: EquipmentStatus;
  notes: string | null;
  assignments: AssignmentSummary[];
}

const STATUS_STYLES: Record<EquipmentStatus, string> = {
  available: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
  in_use: "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500",
  maintenance: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
  retired: "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500",
  rented_out: "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400",
};

export default function EquipmentPage() {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [items, setItems] = useState<Equipment[] | null>(null);
  const [form, setForm] = useState({ name: "", category: "", serialNumber: "", purchaseCost: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Equipment[]>("/equipment").then(setItems);
  }

  useEffect(load, []);

  async function createEquipment(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/equipment", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          serialNumber: form.serialNumber || undefined,
          purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : undefined,
        }),
      });
      setForm({ name: "", category: "", serialNumber: "", purchaseCost: "" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function checkIn(id: string) {
    await apiFetch(`/equipment/${id}/check-in`, { method: "POST" });
    load();
  }

  async function startMaintenance(id: string) {
    await apiFetch(`/equipment/${id}/maintenance/start`, { method: "POST" });
    load();
  }

  async function completeMaintenance(id: string) {
    await apiFetch(`/equipment/${id}/maintenance/complete`, { method: "POST" });
    load();
  }

  async function retire(id: string) {
    await apiFetch(`/equipment/${id}/retire`, { method: "POST" });
    load();
  }

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {error && <p className="mt-4 rounded-md bg-red-50 dark:bg-red-500/15 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}

      <div className="mt-6">
        {!items ? (
          <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
        ) : items.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">{t("noEquipment")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((eq) => {
              const assignment = eq.assignments[0];
              return (
                <div key={eq.id} className="card">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <a href={`/equipment/${eq.id}`} className="text-sm font-medium text-gray-900 dark:text-gray-50 hover:underline">
                        {eq.name}
                      </a>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {eq.category}
                        {eq.serialNumber && ` · ${eq.serialNumber}`}
                        {eq.purchaseCost && ` · ${eq.purchaseCost} ${currency}`}
                      </p>
                      {assignment && (assignment.worker || assignment.project) && (
                        <p className="mt-1 text-xs text-brand-600">
                          {t("currentlyWith")}:{" "}
                          {assignment.worker ? (
                            <Link href={`/team/${assignment.worker.id}`} className="hover:underline">
                              {assignment.worker.name}
                            </Link>
                          ) : (
                            <Link href={`/projects/${assignment.project!.id}`} className="hover:underline">
                              {assignment.project!.name}
                            </Link>
                          )}
                        </p>
                      )}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[eq.status]}`}>
                      {t(`status_${eq.status}`)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {eq.status === "available" && (
                      <a href={`/equipment/${eq.id}`} className="btn-secondary px-2 py-1 text-xs">
                        {t("checkOut")}
                      </a>
                    )}
                    {eq.status === "in_use" && (
                      <button onClick={() => checkIn(eq.id)} className="btn-secondary px-2 py-1 text-xs">
                        {t("checkIn")}
                      </button>
                    )}
                    {eq.status === "available" && (
                      <button onClick={() => startMaintenance(eq.id)} className="btn-secondary px-2 py-1 text-xs">
                        {t("startMaintenance")}
                      </button>
                    )}
                    {eq.status === "maintenance" && (
                      <button onClick={() => completeMaintenance(eq.id)} className="btn-secondary px-2 py-1 text-xs">
                        {t("completeMaintenance")}
                      </button>
                    )}
                    {eq.status !== "in_use" && eq.status !== "retired" && (
                      <button onClick={() => retire(eq.id)} className="btn-secondary px-2 py-1 text-xs">
                        {t("retire")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <section className="card mt-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("addEquipment")}</h2>
        <form onSubmit={createEquipment} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <input
            required
            placeholder={t("namePlaceholder")}
            className="input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            required
            placeholder={t("categoryPlaceholder")}
            className="input"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          />
          <input
            placeholder={t("serialNumberPlaceholder")}
            className="input"
            value={form.serialNumber}
            onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
          />
          <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
            {t("purchaseCost")}
            <input
              type="number"
              step="0.01"
              min="0"
              className="input w-32"
              value={form.purchaseCost}
              onChange={(e) => setForm((f) => ({ ...f, purchaseCost: e.target.value }))}
            />
          </label>
          <button type="submit" disabled={busy} className="btn-primary shrink-0">
            {t("addEquipment")}
          </button>
        </form>
      </section>
    </AuthenticatedShell>
  );
}
