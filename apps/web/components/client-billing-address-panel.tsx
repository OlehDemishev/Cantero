"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SUPPORTED_LOCALES } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";

interface Client {
  street: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  vatId: string | null;
  paymentTermsDays: number | null;
  preferredLocale: string | null;
}

export function ClientBillingAddressPanel({ clientId }: { clientId: string }) {
  const t = useTranslations("clients");
  const tc = useTranslations("common");

  const [billingForm, setBillingForm] = useState({
    street: "",
    city: "",
    postalCode: "",
    country: "",
    vatId: "",
    paymentTermsDays: "",
    preferredLocale: "",
  });
  const [billingSaved, setBillingSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<Client>(`/clients/${clientId}`).then((c) => {
      setBillingForm({
        street: c.street ?? "",
        city: c.city ?? "",
        postalCode: c.postalCode ?? "",
        country: c.country ?? "",
        vatId: c.vatId ?? "",
        paymentTermsDays: c.paymentTermsDays?.toString() ?? "",
        preferredLocale: c.preferredLocale ?? "",
      });
    });
  }, [clientId]);

  async function saveBilling(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setBillingSaved(false);
    try {
      await apiFetch(`/clients/${clientId}`, {
        method: "PATCH",
        body: JSON.stringify({
          street: billingForm.street || null,
          city: billingForm.city || null,
          postalCode: billingForm.postalCode || null,
          country: billingForm.country || null,
          vatId: billingForm.vatId || null,
          paymentTermsDays: billingForm.paymentTermsDays ? Number(billingForm.paymentTermsDays) : null,
          preferredLocale: billingForm.preferredLocale || null,
        }),
      });
      setBillingSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 card max-w-md">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("billingAddress")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("billingAddressHint")}</p>
      <form onSubmit={saveBilling} className="flex flex-col gap-2">
        <input
          className="input"
          placeholder={t("street")}
          value={billingForm.street}
          onChange={(e) => setBillingForm((f) => ({ ...f, street: e.target.value }))}
        />
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder={t("city")}
            value={billingForm.city}
            onChange={(e) => setBillingForm((f) => ({ ...f, city: e.target.value }))}
          />
          <input
            className="input w-24"
            placeholder={t("postalCode")}
            value={billingForm.postalCode}
            onChange={(e) => setBillingForm((f) => ({ ...f, postalCode: e.target.value }))}
          />
          <input
            className="input w-16"
            placeholder={t("countryCode")}
            maxLength={2}
            value={billingForm.country}
            onChange={(e) => setBillingForm((f) => ({ ...f, country: e.target.value.toUpperCase() }))}
          />
        </div>
        <input
          className="input"
          placeholder={t("vatIdPlaceholder")}
          value={billingForm.vatId}
          onChange={(e) => setBillingForm((f) => ({ ...f, vatId: e.target.value }))}
        />
        <label className="flex w-40 flex-col gap-1 text-xs text-gray-500">
          {t("paymentTermsDays")}
          <input
            type="number"
            min="0"
            max="365"
            className="input"
            placeholder={t("paymentTermsDaysPlaceholder")}
            value={billingForm.paymentTermsDays}
            onChange={(e) => setBillingForm((f) => ({ ...f, paymentTermsDays: e.target.value }))}
          />
        </label>
        <label className="flex w-40 flex-col gap-1 text-xs text-gray-500">
          {t("preferredLocale")}
          <select
            className="input"
            value={billingForm.preferredLocale}
            onChange={(e) => setBillingForm((f) => ({ ...f, preferredLocale: e.target.value }))}
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
          <button type="submit" disabled={busy} className="btn-secondary self-start">
            {tc("save")}
          </button>
          {billingSaved && <span className="text-xs text-success-700">{tc("saved")}</span>}
        </div>
      </form>
    </div>
  );
}
