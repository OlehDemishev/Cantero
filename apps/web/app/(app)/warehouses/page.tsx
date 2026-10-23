"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CsvImportButton } from "@/components/csv-import-button";
import { WarehouseDetail } from "@/components/warehouse-detail";
import { WarehouseReorderSettings } from "@/components/warehouse-reorder-settings";
import { WarehouseSustainabilitySettings } from "@/components/warehouse-sustainability-settings";
import { EmptyState } from "@/components/ui/empty-state";
import { CloseIcon, WarehousesIcon } from "@/components/nav-icons";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

interface Warehouse {
  id: string;
  name: string;
  address: string | null;
}

export default function WarehousesPage() {
  const t = useTranslations("warehouses");
  const tc = useTranslations("common");
  const ti = useTranslations("import");

  const { data: warehouses = null, error: warehousesError, reload: reloadWarehouses } = useApi<Warehouse[]>("/materials/warehouses");
  const [picked, setSelected] = useState<string | null>(null);
  // The first warehouse is open until another is picked.
  const selected = picked ?? warehouses?.[0]?.id ?? null;
  const [form, setForm] = useState({ name: "", address: "" });
  const [submitting, setSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  function loadWarehouses() {
    void reloadWarehouses();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/materials/warehouses", {
        method: "POST",
        body: JSON.stringify({ name: form.name, address: form.address || undefined }),
      });
      setForm({ name: "", address: "" });
      setShowCreateForm(false);
      loadWarehouses();
    } finally {
      setSubmitting(false);
    }
  }

  const hasWarehouses = !!warehouses && warehouses.length > 0;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <CsvImportButton
            endpoint="/materials/catalog/import"
            label={ti("importMaterials")}
            onDone={() => window.location.reload()}
          />
          {!showCreateForm && (
            <button type="button" onClick={() => setShowCreateForm(true)} className="btn-primary">
              {t("newWarehouse")}
            </button>
          )}
        </div>
      </div>

      {showCreateForm && (
        <div className="mt-6 card max-w-md">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg-muted">{t("newWarehouse")}</h2>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              aria-label={tc("cancel")}
              className="text-fg-subtle hover:text-gray-600 dark:hover:text-gray-300"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              required
              autoFocus
              placeholder={tc("name")}
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              placeholder={t("address")}
              className="input"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
            <button type="submit" disabled={submitting} className="btn-primary">
              {tc("create")}
            </button>
          </form>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        {hasWarehouses && (
          <div className="card lg:col-span-1 h-fit">
            <div className="mb-2 text-xs font-semibold text-fg-subtle">{t("title")}</div>
            <ul className="flex flex-col gap-1">
              {warehouses!.map((w) => (
                <li key={w.id}>
                  <button
                    onClick={() => setSelected(w.id)}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                      selected === w.id ? "bg-gray-900 text-white" : "hover:bg-gray-100 dark:hover:bg-white/5"
                    }`}
                  >
                    {w.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={hasWarehouses ? "lg:col-span-2" : "lg:col-span-3"}>
          {!warehouses ? (
            warehousesError ? <ErrorState error={warehousesError} onRetry={reloadWarehouses} compact /> : <Skeleton lines={3} />
          ) : warehouses.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={WarehousesIcon}
                title={t("emptyTitle")}
                message={t("empty")}
                cta={{ label: t("newWarehouse"), onClick: () => setShowCreateForm(true) }}
              />
            </div>
          ) : selected ? (
            <WarehouseDetail warehouseId={selected} allWarehouses={warehouses} />
          ) : null}
        </div>
      </div>

      <WarehouseReorderSettings />
      <WarehouseSustainabilitySettings />
    </>
  );
}
