"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, API_URL } from "@/lib/api-client";

interface Company {
  ipAllowlist: string[];
  slackWebhookUrl: string | null;
  teamsWebhookUrl: string | null;
  calendarFeedToken: string | null;
}

export function IntegrationsPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("integrations");
  const tc = useTranslations("common");

  const [form, setForm] = useState({ ipAllowlist: "", slackWebhookUrl: "", teamsWebhookUrl: "" });
  const [calendarFeedToken, setCalendarFeedToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  function load() {
    apiFetch<Company>("/company").then((c) => {
      setForm({
        ipAllowlist: c.ipAllowlist.join("\n"),
        slackWebhookUrl: c.slackWebhookUrl ?? "",
        teamsWebhookUrl: c.teamsWebhookUrl ?? "",
      });
      setCalendarFeedToken(c.calendarFeedToken);
    });
  }

  useEffect(load, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    try {
      await apiFetch("/company", {
        method: "PATCH",
        body: JSON.stringify({
          ipAllowlist: form.ipAllowlist
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          slackWebhookUrl: form.slackWebhookUrl || null,
          teamsWebhookUrl: form.teamsWebhookUrl || null,
        }),
      });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  async function generateCalendarFeed() {
    setBusy(true);
    try {
      const result = await apiFetch<{ calendarFeedToken: string }>("/company/calendar-feed-token", { method: "POST" });
      setCalendarFeedToken(result.calendarFeedToken);
    } finally {
      setBusy(false);
    }
  }

  const feedUrl = calendarFeedToken ? `${API_URL}/public/calendar/${calendarFeedToken}.ics` : null;

  return (
    <section id="integrations" className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-4 text-xs text-gray-500">{t("hint")}</p>

      <form onSubmit={save} className="flex flex-col gap-3">
        <label className="text-xs text-gray-500">
          {t("slackWebhookUrl")}
          <input
            type="url"
            className="input mt-1"
            placeholder="https://hooks.slack.com/services/..."
            value={form.slackWebhookUrl}
            onChange={(e) => setForm((f) => ({ ...f, slackWebhookUrl: e.target.value }))}
            disabled={!canManage}
          />
        </label>
        <label className="text-xs text-gray-500">
          {t("teamsWebhookUrl")}
          <input
            type="url"
            className="input mt-1"
            placeholder="https://outlook.office.com/webhook/..."
            value={form.teamsWebhookUrl}
            onChange={(e) => setForm((f) => ({ ...f, teamsWebhookUrl: e.target.value }))}
            disabled={!canManage}
          />
        </label>
        <label className="text-xs text-gray-500">
          {t("ipAllowlist")}
          <span className="mt-0.5 block text-gray-400">{t("ipAllowlistHint")}</span>
          <textarea
            className="input mt-1 h-20 font-mono"
            placeholder={"203.0.113.4\n203.0.113.0/24"}
            value={form.ipAllowlist}
            onChange={(e) => setForm((f) => ({ ...f, ipAllowlist: e.target.value }))}
            disabled={!canManage}
          />
        </label>
        {canManage && (
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy} className="btn-primary self-start">
              {tc("save")}
            </button>
            {saved && <span className="text-xs text-success-700">{tc("saved")}</span>}
          </div>
        )}
      </form>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("calendarFeed")}</h3>
        <p className="mb-2 text-xs text-gray-500">{t("calendarFeedHint")}</p>
        {feedUrl && <p className="mb-2 break-all rounded bg-gray-50 p-2 font-mono text-xs">{feedUrl}</p>}
        {canManage && (
          <button onClick={generateCalendarFeed} disabled={busy} className="btn-secondary px-3 py-1 text-xs">
            {calendarFeedToken ? t("regenerateCalendarFeed") : t("generateCalendarFeed")}
          </button>
        )}
      </div>
    </section>
  );
}
