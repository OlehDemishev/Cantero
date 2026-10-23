"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { EquipmentStatus } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/lib/use-me";
import { formatCurrency } from "@/lib/format-currency";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/status-tone";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Field } from "@/components/ui/field";

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

export default function EquipmentPage() {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const { data: items = null, reload: reloadItems, error: itemsError } = useApi<Equipment[]>("/equipment");
  const [form, setForm] = useState({ name: "", category: "", serialNumber: "", purchaseCost: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    void reloadItems();
  }

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
    <>
      <PageHeader title={t("title")} />
      {error && <Alert tone="danger" className="mt-4">{error}</Alert>}

      <div className="mt-6">
        {!items ? (
          itemsError ? <ErrorState error={itemsError} onRetry={reloadItems} compact /> : <Skeleton lines={3} />
        ) : items.length === 0 ? (
          <p className="text-fg-subtle">{t("noEquipment")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((eq) => {
              const assignment = eq.assignments[0];
              return (
                <div key={eq.id} className="card">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <a href={`/equipment/${eq.id}`} className="text-sm font-medium text-fg hover:underline">
                        {eq.name}
                      </a>
                      <p className="text-xs text-fg-subtle">
                        {eq.category}
                        {eq.serialNumber && ` · ${eq.serialNumber}`}
                        {eq.purchaseCost && ` · ${formatCurrency(eq.purchaseCost, currency)}`}
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
                    <Badge tone={statusTone(eq.status)} className="shrink-0">
                      {t(`status_${eq.status}`)}
                    </Badge>
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
        <h2 className="mb-4 text-sm font-semibold text-fg-muted">{t("addEquipment")}</h2>
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
          <Field label={t("purchaseCost")} size="sm">
            <input
              type="number"
              step="0.01"
              min="0"
              className="input w-32"
              value={form.purchaseCost}
              onChange={(e) => setForm((f) => ({ ...f, purchaseCost: e.target.value }))}
            />
          </Field>
          <button type="submit" disabled={busy} className="btn-primary shrink-0">
            {t("addEquipment")}
          </button>
        </form>
      </section>
    </>
  );
}
