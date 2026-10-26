"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SUPPORTED_LOCALES } from "@cantero/shared";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { Field } from "@/components/ui/field";

interface Client {
  street: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  vatId: string | null;
  datevDebitorNumber: string | null;
  peppolScheme: string | null;
  peppolParticipantId: string | null;
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
    datevDebitorNumber: "",
    peppolScheme: "",
    peppolParticipantId: "",
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
        datevDebitorNumber: c.datevDebitorNumber ?? "",
        peppolScheme: c.peppolScheme ?? "",
        peppolParticipantId: c.peppolParticipantId ?? "",
        paymentTermsDays: c.paymentTermsDays?.toString() ?? "",
        preferredLocale: c.preferredLocale ?? "",
      });
    }).catch(notifyApiError);
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
          datevDebitorNumber: billingForm.datevDebitorNumber || null,
          peppolScheme: billingForm.peppolScheme || null,
          peppolParticipantId: billingForm.peppolParticipantId || null,
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
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("billingAddress")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("billingAddressHint")}</p>
      <form onSubmit={saveBilling} className="flex flex-col gap-2">
        <input
          className="input"
          placeholder={t("street")} aria-label={t("street")}
          value={billingForm.street}
          onChange={(e) => setBillingForm((f) => ({ ...f, street: e.target.value }))}
        />
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder={t("city")} aria-label={t("city")}
            value={billingForm.city}
            onChange={(e) => setBillingForm((f) => ({ ...f, city: e.target.value }))}
          />
          <input
            className="input w-24"
            placeholder={t("postalCode")} aria-label={t("postalCode")}
            value={billingForm.postalCode}
            onChange={(e) => setBillingForm((f) => ({ ...f, postalCode: e.target.value }))}
          />
          <input
            className="input w-16"
            placeholder={t("countryCode")} aria-label={t("countryCode")}
            maxLength={2}
            value={billingForm.country}
            onChange={(e) => setBillingForm((f) => ({ ...f, country: e.target.value.toUpperCase() }))}
          />
        </div>
        <input
          className="input"
          placeholder={t("vatIdPlaceholder")} aria-label={t("vatIdPlaceholder")}
          value={billingForm.vatId}
          onChange={(e) => setBillingForm((f) => ({ ...f, vatId: e.target.value }))}
        />
        <input
          className="input"
          placeholder={t("datevDebitorNumber")} aria-label={t("datevDebitorNumber")}
          value={billingForm.datevDebitorNumber}
          onChange={(e) => setBillingForm((f) => ({ ...f, datevDebitorNumber: e.target.value.replace(/\D/g, "") }))}
        />
        <div className="flex gap-2">
          <input
            className="input w-24"
            placeholder={t("peppolScheme")} aria-label={t("peppolScheme")}
            value={billingForm.peppolScheme}
            onChange={(e) => setBillingForm((f) => ({ ...f, peppolScheme: e.target.value }))}
          />
          <input
            className="input flex-1"
            placeholder={t("peppolParticipantId")} aria-label={t("peppolParticipantId")}
            value={billingForm.peppolParticipantId}
            onChange={(e) => setBillingForm((f) => ({ ...f, peppolParticipantId: e.target.value }))}
          />
        </div>
        <Field label={t("paymentTermsDays")} size="sm" className="w-40">
          <input
            type="number"
            min="0"
            max="365"
            className="input"
            placeholder={t("paymentTermsDaysPlaceholder")}
            value={billingForm.paymentTermsDays}
            onChange={(e) => setBillingForm((f) => ({ ...f, paymentTermsDays: e.target.value }))}
          />
        </Field>
        <Field label={t("preferredLocale")} size="sm" className="w-40">
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
        </Field>
        <div className="flex items-center gap-2">
          <button type="submit" disabled={busy} className="btn-secondary self-start">
            {tc("save")}
          </button>
          {billingSaved && <span className="text-xs text-success-fg">{tc("saved")}</span>}
        </div>
      </form>
    </div>
  );
}
