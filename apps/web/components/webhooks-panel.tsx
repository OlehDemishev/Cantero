"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { WEBHOOK_EVENTS, WEBHOOK_TEMPLATES, type WebhookEvent } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format-date";

interface WebhookEndpoint {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: string | null;
}
interface WebhookDelivery {
  id: string;
  event: string;
  success: boolean;
  statusCode: number | null;
  error: string | null;
  createdAt: string;
}

export function WebhooksPanel() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[] | null>(null);
  const [webhookForm, setWebhookForm] = useState<{ url: string; events: WebhookEvent[] }>({ url: "", events: [] });
  const [createdWebhookSecret, setCreatedWebhookSecret] = useState<string | null>(null);
  const [webhookSecretCopied, setWebhookSecretCopied] = useState(false);
  const [expandedWebhookId, setExpandedWebhookId] = useState<string | null>(null);
  const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDelivery[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<WebhookEndpoint[]>("/company/webhooks").then(setWebhooks);
  }

  useEffect(load, []);

  function toggleWebhookEvent(event: WebhookEvent) {
    setWebhookForm((f) => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter((e) => e !== event) : [...f.events, event],
    }));
  }

  async function createWebhook(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setWebhookSecretCopied(false);
    setError(null);
    try {
      const created = await apiFetch<{ secret: string }>("/company/webhooks", {
        method: "POST",
        body: JSON.stringify(webhookForm),
      });
      setCreatedWebhookSecret(created.secret);
      setWebhookForm({ url: "", events: [] });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function copyWebhookSecret() {
    if (!createdWebhookSecret) return;
    await navigator.clipboard.writeText(createdWebhookSecret);
    setWebhookSecretCopied(true);
  }

  async function toggleWebhookActive(webhook: WebhookEndpoint) {
    await apiFetch(`/company/webhooks/${webhook.id}`, { method: "PATCH", body: JSON.stringify({ active: !webhook.active }) });
    load();
  }

  async function regenerateWebhookSecret(id: string) {
    setWebhookSecretCopied(false);
    const result = await apiFetch<{ secret: string }>(`/company/webhooks/${id}/regenerate-secret`, { method: "POST" });
    setCreatedWebhookSecret(result.secret);
  }

  async function deleteWebhook(id: string) {
    if (!window.confirm(t("confirmDeleteWebhook"))) return;
    await apiFetch(`/company/webhooks/${id}`, { method: "DELETE" });
    if (expandedWebhookId === id) setExpandedWebhookId(null);
    load();
  }

  async function toggleWebhookLog(id: string) {
    if (expandedWebhookId === id) {
      setExpandedWebhookId(null);
      return;
    }
    setExpandedWebhookId(id);
    setWebhookDeliveries(null);
    const deliveries = await apiFetch<WebhookDelivery[]>(`/company/webhooks/${id}/deliveries`);
    setWebhookDeliveries(deliveries);
  }

  return (
    <section id="webhooks" className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("webhooks")}</h2>
      <p className="mb-4 text-xs text-gray-500">{t("webhooksHint")}</p>
      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {createdWebhookSecret && (
        <div className="mb-4 rounded-md border border-warning-200 bg-warning-50 px-3 py-2">
          <p className="text-xs text-warning-700">{t("webhookSecretShownOnce")}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs">{createdWebhookSecret}</code>
            <button onClick={copyWebhookSecret} className="btn-secondary shrink-0 px-3 py-1 text-xs">
              {webhookSecretCopied ? tc("saved") : t("copySecret")}
            </button>
          </div>
        </div>
      )}

      {!webhooks || webhooks.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noWebhooks")}</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {webhooks.map((w) => (
            <li key={w.id} className="rounded-md border border-gray-200 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">{w.url}</p>
                  <p className="mt-0.5 flex flex-wrap gap-1">
                    {w.events.map((ev) => (
                      <span key={ev} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {t(`webhookEvent_${ev.replace(".", "_")}`)}
                      </span>
                    ))}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {w.lastDeliveryAt ? (
                      <span className={w.lastDeliveryStatus === "success" ? "text-success-600" : "text-error-600"}>
                        {t("lastDelivery")}: {t(w.lastDeliveryStatus === "success" ? "webhookSuccess" : "webhookFailed")} ·{" "}
                        {formatDateTime(new Date(w.lastDeliveryAt))}
                      </span>
                    ) : (
                      <span>{t("lastDelivery")}: {t("never")}</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${w.active ? "bg-success-50 text-success-700" : "bg-gray-100 text-gray-500"}`}>
                    {w.active ? t("active") : t("inactive")}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => toggleWebhookLog(w.id)} className="btn-secondary px-2 py-1 text-xs">
                      {t("viewLog")}
                    </button>
                    <button onClick={() => toggleWebhookActive(w)} className="btn-secondary px-2 py-1 text-xs">
                      {w.active ? t("deactivate") : t("activate")}
                    </button>
                    <button onClick={() => regenerateWebhookSecret(w.id)} className="btn-secondary px-2 py-1 text-xs">
                      {t("regenerateSecret")}
                    </button>
                    <button onClick={() => deleteWebhook(w.id)} className="btn-secondary px-2 py-1 text-xs">
                      {t("revoke")}
                    </button>
                  </div>
                </div>
              </div>

              {expandedWebhookId === w.id && (
                <div className="mt-2 border-t border-gray-100 pt-2">
                  {!webhookDeliveries ? (
                    <p className="text-xs text-gray-400">{tc("loading")}</p>
                  ) : webhookDeliveries.length === 0 ? (
                    <p className="text-xs text-gray-400">{t("noDeliveries")}</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {webhookDeliveries.map((d) => (
                        <li key={d.id} className="flex items-center justify-between text-xs">
                          <span className={d.success ? "text-success-600" : "text-error-600"}>
                            {d.event} {d.statusCode ? `· HTTP ${d.statusCode}` : d.error ? `· ${d.error}` : ""}
                          </span>
                          <span className="text-gray-400">{formatDateTime(new Date(d.createdAt))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={createWebhook} className="flex flex-col gap-2">
        <input
          required
          type="url"
          placeholder={t("webhookUrlPlaceholder")}
          className="input"
          value={webhookForm.url}
          onChange={(e) => setWebhookForm((f) => ({ ...f, url: e.target.value }))}
        />
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          {t("webhookTemplate")}
          <select
            className="input w-auto"
            value=""
            onChange={(e) => {
              const template = WEBHOOK_TEMPLATES.find((tpl) => tpl.id === e.target.value);
              if (template) setWebhookForm((f) => ({ ...f, events: [...template.events] }));
            }}
          >
            <option value="">{t("webhookTemplatePickPlaceholder")}</option>
            {WEBHOOK_TEMPLATES.map((tpl) => (
              <option key={tpl.id} value={tpl.id} title={tpl.description}>
                {tpl.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          {WEBHOOK_EVENTS.map((ev) => (
            <label key={ev} className="flex items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={webhookForm.events.includes(ev)}
                onChange={() => toggleWebhookEvent(ev)}
              />
              {t(`webhookEvent_${ev.replace(".", "_")}`)}
            </label>
          ))}
        </div>
        <button type="submit" disabled={busy || webhookForm.events.length === 0} className="btn-primary self-start">
          {t("createWebhook")}
        </button>
      </form>
    </section>
  );
}
