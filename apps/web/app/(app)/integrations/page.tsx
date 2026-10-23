"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { AccountingProviderType } from "@cantero/shared";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";

interface Company {
  // Whether each is set up — the webhook URLs and feed token themselves only reach settings.company holders.
  hasSlackWebhook: boolean;
  hasTeamsWebhook: boolean;
  hasCalendarFeed: boolean;
  publicLeadFormToken: string | null;
}
interface AccountingStatus {
  connected: boolean;
  provider?: AccountingProviderType;
}
interface SsoConfig {
  ssoDomain: string | null;
  ssoDomainVerified: boolean;
}

type Status = "connected" | "not-connected" | "loading";

interface IntegrationCard {
  id: string;
  titleKey: string;
  descriptionKey: string;
  href: string;
  status: Status;
  detail?: string;
}

export default function IntegrationsPage() {
  const t = useTranslations("integrationsMarketplace");

  const { data: company = null } = useApi<Company>("/company");
  const { data: accounting = null } = useApi<AccountingStatus>("/company/accounting/status");
  const { data: sso = null } = useApi<SsoConfig>("/company/sso");
  const [apiKeyCount, setApiKeyCount] = useState<number | null>(null);
  const [webhookCount, setWebhookCount] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<unknown[]>("/company/api-keys").then((list) => setApiKeyCount(list.length)).catch(notifyApiError);
    apiFetch<unknown[]>("/company/webhooks").then((list) => setWebhookCount(list.length)).catch(notifyApiError);
  }, []);

  const cards: IntegrationCard[] = [
    {
      id: "accounting",
      titleKey: "accounting",
      descriptionKey: "accountingDescription",
      href: "/settings?tab=integrations",
      status: accounting === null ? "loading" : accounting.connected ? "connected" : "not-connected",
      detail: accounting?.connected ? accounting.provider : undefined,
    },
    {
      id: "slack",
      titleKey: "slack",
      descriptionKey: "slackDescription",
      href: "/settings?tab=integrations",
      status: company === null ? "loading" : company.hasSlackWebhook ? "connected" : "not-connected",
    },
    {
      id: "teams",
      titleKey: "teams",
      descriptionKey: "teamsDescription",
      href: "/settings?tab=integrations",
      status: company === null ? "loading" : company.hasTeamsWebhook ? "connected" : "not-connected",
    },
    {
      id: "calendar-feed",
      titleKey: "calendarFeed",
      descriptionKey: "calendarFeedDescription",
      href: "/settings?tab=integrations",
      status: company === null ? "loading" : company.hasCalendarFeed ? "connected" : "not-connected",
    },
    {
      id: "webhooks",
      titleKey: "webhooks",
      descriptionKey: "webhooksDescription",
      href: "/settings?tab=integrations",
      status: webhookCount === null ? "loading" : webhookCount > 0 ? "connected" : "not-connected",
      detail: webhookCount ? t("webhookCount", { count: webhookCount }) : undefined,
    },
    {
      id: "api-keys",
      titleKey: "apiKeys",
      descriptionKey: "apiKeysDescription",
      href: "/settings?tab=integrations",
      status: apiKeyCount === null ? "loading" : apiKeyCount > 0 ? "connected" : "not-connected",
      detail: apiKeyCount ? t("apiKeyCount", { count: apiKeyCount }) : undefined,
    },
    {
      id: "sso",
      titleKey: "sso",
      descriptionKey: "ssoDescription",
      href: "/settings?tab=team",
      status: sso === null ? "loading" : sso.ssoDomain && sso.ssoDomainVerified ? "connected" : "not-connected",
    },
    {
      id: "lead-form",
      titleKey: "leadForm",
      descriptionKey: "leadFormDescription",
      href: "/settings?tab=templates",
      status: company === null ? "loading" : company.publicLeadFormToken ? "connected" : "not-connected",
    },
    {
      id: "billing",
      titleKey: "billing",
      descriptionKey: "billingDescription",
      href: "/settings?tab=billing",
      status: "connected",
    },
  ];

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-sm text-fg-subtle">{t("hint")}</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <a key={card.id} href={card.href} className="card flex flex-col gap-2 hover:border-gray-400">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-fg">{t(card.titleKey)}</h2>
              {card.status !== "loading" && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    card.status === "connected" ? "bg-success-50 dark:bg-success-500/15 text-success-fg" : "bg-gray-100 dark:bg-gray-700 text-fg-subtle"
                  }`}
                >
                  {card.status === "connected" ? t("connected") : t("notConnected")}
                </span>
              )}
            </div>
            <p className="text-xs text-fg-subtle">{t(card.descriptionKey)}</p>
            {card.detail && <p className="text-xs font-medium text-gray-600 dark:text-gray-300">{card.detail}</p>}
          </a>
        ))}
      </div>
    </>
  );
}
