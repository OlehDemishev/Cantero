"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { FormError } from "@/components/ui/field";
import type { BarcodeLookupResult } from "./types";

/** Look a material up by its barcode: where it is in stock, across every warehouse. */
export function BarcodeLookup() {
  const t = useTranslations("warehouses");
  const tc = useTranslations("common");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeResult, setBarcodeResult] =
    useState<BarcodeLookupResult | null>(null);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  async function lookupBarcode(e: React.FormEvent) {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    setBarcodeError(null);
    setBarcodeResult(null);
    try {
      const result = await apiFetch<BarcodeLookupResult>(
        `/materials/catalog/by-barcode/${encodeURIComponent(barcodeInput.trim())}`,
      );
      setBarcodeResult(result);
    } catch (err) {
      setBarcodeError(err instanceof Error ? err.message : tc("error"));
    }
  }

  return (
    <>
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">
        {t("scanBarcode")}
      </h2>
      <form onSubmit={lookupBarcode} className="flex items-end gap-2">
        <input
          placeholder={t("barcodePlaceholder")} aria-label={t("barcodePlaceholder")}
          className="input w-56"
          value={barcodeInput}
          onChange={(e) => setBarcodeInput(e.target.value)}
        />
        <button type="submit" className="btn-secondary px-3 py-1.5 text-xs">
          {t("lookUp")}
        </button>
      </form>
      {barcodeError && (
        <FormError className="mt-1">{barcodeError}</FormError>
      )}
      {barcodeResult && (
        <div className="mt-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-sm">
          <p className="font-medium text-fg">
            {barcodeResult.name} ({barcodeResult.code})
          </p>
          {barcodeResult.stockLevels.length === 0 ? (
            <p className="mt-1 text-xs text-fg-subtle">
              {t("noStockAnywhere")}
            </p>
          ) : (
            <ul className="mt-1 flex flex-col gap-0.5 text-xs text-fg-subtle">
              {barcodeResult.stockLevels.map((sl) => (
                <li key={sl.warehouse.id}>
                  {sl.warehouse.name}: {sl.quantityOnHand} {barcodeResult.unit}
                  {sl.binLocation && ` — ${t("bin")} ${sl.binLocation}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
