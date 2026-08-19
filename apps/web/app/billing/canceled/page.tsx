"use client";

import { useTranslations } from "next-intl";

export default function BillingCanceledPage() {
  const t = useTranslations("billing");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <h1 className="text-2xl font-semibold">{t("canceledTitle")}</h1>
      <p className="mt-2 text-sm text-gray-600">{t("canceledBody")}</p>
      <a href="/billing/pending" className="btn-primary mt-6">
        {t("checkoutButton")}
      </a>
    </main>
  );
}
