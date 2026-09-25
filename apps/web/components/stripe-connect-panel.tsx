"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface StripeConnectStatus {
  connected: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
}

/** Connects the company's own Stripe account, which its clients' online invoice payments and
 * autopay go to (Stripe Connect) — until that's done the portal offers no online payment. */
export function StripeConnectPanel() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [status, setStatus] = useState<StripeConnectStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<StripeConnectStatus>("/billing/stripe-connect")
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : tc("error")));
  }, [tc]);

  async function startOnboarding() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>("/billing/stripe-connect/onboarding-link", { method: "POST" });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
      setBusy(false);
    }
  }

  return (
    <section id="online-payments" className="card mt-6">
      <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("onlinePayments")}</h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("onlinePaymentsHint")}</p>
      {error && <p className="mb-3 rounded-md bg-red-50 dark:bg-red-500/15 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {status && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-gray-700 dark:text-gray-200">
            {status.chargesEnabled ? t("stripeConnected") : status.connected ? t("stripeOnboardingIncomplete") : t("stripeNotConnected")}
          </span>
          {!status.chargesEnabled && (
            <button type="button" onClick={startOnboarding} disabled={busy} className="btn-secondary">
              {status.connected ? t("stripeContinueOnboarding") : t("stripeConnect")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
