"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatCurrency } from "@/lib/format-currency";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

interface CapacityUtilization {
  limit: number | null;
  used: number;
  available: number | null;
  utilizationPercent: number | null;
}

export function BondingCapacityPanel() {
  const t = useTranslations("suretyBonds");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [capacity, setCapacity] = useState<CapacityUtilization | null>(null);
  const [capacityError, setCapacityError] = useState<Error | null>(null);
  const [limitInput, setLimitInput] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<CapacityUtilization>("/surety-bonds/capacity").then((c) => {
      setCapacityError(null);
      setCapacity(c);
      setLimitInput(c.limit !== null ? String(c.limit) : "");
    }).catch(setCapacityError);
  }
  useEffect(load, []);

  async function saveLimit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/surety-bonds/capacity", {
        method: "PATCH",
        body: JSON.stringify({ bondingCapacityLimit: limitInput ? Number(limitInput) : null }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!capacity) return capacityError ? <ErrorState error={capacityError} onRetry={load} compact /> : <Skeleton lines={3} />;

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("capacityTitle")}</h2>
      <p className="mb-4 text-sm text-fg-subtle">{t("capacityHint")}</p>

      <div className="card max-w-md">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-fg-subtle">{t("used")}</div>
            <div className="mt-1 font-semibold text-fg">
              {formatCurrency(capacity.used, currency)}
            </div>
          </div>
          <div>
            <div className="text-xs text-fg-subtle">{t("available")}</div>
            <div className="mt-1 font-semibold text-fg">{capacity.available !== null ? `${formatCurrency(capacity.available, currency)}` : "—"}</div>
          </div>
        </div>
        {capacity.utilizationPercent !== null && (
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
              <div
                className={`h-full rounded-full ${capacity.utilizationPercent >= 90 ? "bg-error-500" : capacity.utilizationPercent >= 60 ? "bg-amber-500" : "bg-success-500"}`}
                style={{ width: `${Math.min(100, capacity.utilizationPercent)}%` }}
              />
            </div>
            <span className="text-xs text-fg-subtle">{capacity.utilizationPercent}%</span>
          </div>
        )}

        <form onSubmit={saveLimit} className="mt-4 flex items-end gap-2 border-t border-gray-100 dark:border-gray-700 pt-4">
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
            {t("capacityLimit")}
            <input
              type="number"
              step="0.01"
              min="0"
              className="input w-40"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy} className="btn-secondary">
            {tc("save")}
          </button>
        </form>
      </div>
    </div>
  );
}
