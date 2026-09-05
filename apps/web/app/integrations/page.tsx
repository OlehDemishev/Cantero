"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";

interface Company {
  slackWebhookUrl: string | null;
  teamsWebhookUrl: string | null;
  calendarFeedToken: string | null;
  publicLeadFormToken: string | null;
}
interface AccountingStatus {
  connected: boolean;
  provider?: "quickbooks" | "xero";
}
interface SsoConfig {
  ssoDomain: string | null;
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

  const [company, setCompany] = useState<Company | null>(null);
  const [accounting, setAccounting] = useState<AccountingStatus | null>(null);
  const [sso, setSso] = useState<SsoConfig | null>(null);
  const [apiKeyCount, setApiKeyCount] = useState<number | null>(null);
  const [webhookCount, setWebhookCount] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<Company>("/company").then(setCompany);
    apiFetch<AccountingStatus>("/company/accounting/status").then(setAccounting);
    apiFetch<SsoConfig>("/company/sso").then(setSso);
    apiFetch<unknown[]>("/company/api-keys").then((list) => setApiKeyCount(list.length));
    apiFetch<unknown[]>("/company/webhooks").then((list) => setWebhookCount(list.length));
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
      status: company === null ? "loading" : company.slackWebhookUrl ? "connected" : "not-connected",
    },
    {
      id: "teams",
      titleKey: "teams",
      descriptionKey: "teamsDescription",
      href: "/settings?tab=integrations",
      status: company === null ? "loading" : company.teamsWebhookUrl ? "connected" : "not-connected",
    },
    {
      id: "calendar-feed",
      titleKey: "calendarFeed",
      descriptionKey: "calendarFeedDescription",
      href: "/settings?tab=integrations",
      status: company === null ? "loading" : company.calendarFeedToken ? "connected" : "not-connected",
    },
    {
      id: "webhooks",
      titleKey: "webhooks",
      descriptionKey: "webhooksDescription",
      href: "/settings?tab=integrations",
      status: webhookCount === null ? "loading" : webhookCount > 0 ? "connected" : "not-connected",
      detail: webhookCount !== null ? String(webhookCount) : undefined,
    },
    {
      id: "api-keys",
      titleKey: "apiKeys",
      descriptionKey: "apiKeysDescription",
      href: "/settings?tab=integrations",
      status: apiKeyCount === null ? "loading" : apiKeyCount > 0 ? "connected" : "not-connected",
      detail: apiKeyCount !== null ? String(apiKeyCount) : undefined,
    },
    {
      id: "sso",
      titleKey: "sso",
      descriptionKey: "ssoDescription",
      href: "/settings?tab=team",
      status: sso === null ? "loading" : sso.ssoDomain ? "connected" : "not-connected",
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
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-sm text-gray-500">{t("hint")}</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <a key={card.id} href={card.href} className="card flex flex-col gap-2 hover:border-gray-400">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">{t(card.titleKey)}</h2>
              {card.status !== "loading" && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    card.status === "connected" ? "bg-success-50 text-success-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {card.status === "connected" ? t("connected") : t("notConnected")}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">{t(card.descriptionKey)}</p>
            {card.detail && <p className="text-xs font-medium text-gray-600">{card.detail}</p>}
          </a>
        ))}
      </div>
    </AuthenticatedShell>
  );
}
