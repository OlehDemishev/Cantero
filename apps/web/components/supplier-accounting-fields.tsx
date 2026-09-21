"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface Props {
  supplier: { id: string; vatId: string | null; sageVendorId: string | null };
  onSaved: () => void;
}

/** The two identifiers other systems match a supplier by: the VAT ID an incoming e-invoice
 * carries (auto-match, see IncomingEInvoicesService) and the Vendor ID the company's Sage 300 CRE
 * knows it as (AP invoice export, see sage-300-cre.ts). Neither can be guessed, so both are typed. */
export function SupplierAccountingFields({ supplier, onSaved }: Props) {
  const t = useTranslations("suppliers");
  const tc = useTranslations("common");
  const [vatId, setVatId] = useState(supplier.vatId ?? "");
  const [sageVendorId, setSageVendorId] = useState(supplier.sageVendorId ?? "");
  const [busy, setBusy] = useState(false);
  const dirty = vatId !== (supplier.vatId ?? "") || sageVendorId !== (supplier.sageVendorId ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/materials/suppliers/${supplier.id}`, {
        method: "PATCH",
        body: JSON.stringify({ vatId: vatId.trim() || null, sageVendorId: sageVendorId.trim() || null }),
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("accountingIds")}</h3>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("vatId")}
          <input className="input" maxLength={40} value={vatId} onChange={(e) => setVatId(e.target.value)} placeholder="DE123456789" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("sageVendorId")}
          <input className="input" maxLength={10} value={sageVendorId} onChange={(e) => setSageVendorId(e.target.value)} />
        </label>
        <button type="submit" disabled={busy || !dirty} className="btn-secondary px-2.5 py-1.5 text-xs">
          {tc("save")}
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t("accountingIdsHint")}</p>
    </form>
  );
}
