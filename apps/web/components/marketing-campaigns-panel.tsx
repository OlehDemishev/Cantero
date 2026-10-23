"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/lib/use-me";
import { formatCurrency } from "@/lib/format-currency";
import { Field } from "@/components/ui/field";

interface Campaign {
  id: string;
  name: string;
  channel: string;
  spend: string | null;
  startDate: string | null;
  endDate: string | null;
  _count: { clients: number };
}

export function MarketingCampaignsPanel() {
  const t = useTranslations("marketing");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const { data: campaigns = null, reload: reloadCampaigns, error: campaignsError } = useApi<Campaign[]>("/marketing/campaigns");
  const [form, setForm] = useState({ name: "", channel: "", spend: "", startDate: "", endDate: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadCampaigns();
  }

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.channel.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/marketing/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          channel: form.channel.trim(),
          spend: form.spend ? Number(form.spend) : undefined,
          startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
          endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
        }),
      });
      setForm({ name: "", channel: "", spend: "", startDate: "", endDate: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("campaignsTitle")}</h2>
      <p className="mb-4 text-sm text-fg-subtle">{t("campaignsHint")}</p>

      <form onSubmit={createCampaign} className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <input
          required
          placeholder={t("campaignNamePlaceholder")} aria-label={t("campaignNamePlaceholder")}
          className="input"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          required
          placeholder={t("channelPlaceholder")} aria-label={t("channelPlaceholder")}
          className="input"
          value={form.channel}
          onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
        />
        <Field label={t("spend")} size="sm">
          <input
            type="number"
            step="0.01"
            min="0"
            className="input w-32"
            value={form.spend}
            onChange={(e) => setForm((f) => ({ ...f, spend: e.target.value }))}
          />
        </Field>
        <button type="submit" disabled={busy} className="btn-primary shrink-0">
          {t("addCampaign")}
        </button>
      </form>

      {campaigns === null ? (
        campaignsError ? <ErrorState error={campaignsError} onRetry={reloadCampaigns} compact /> : <Skeleton lines={3} />
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noCampaigns")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {campaigns.map((c) => (
            <li key={c.id} className="card flex items-center justify-between text-sm">
              <span>
                {c.name} <span className="text-xs text-fg-subtle">({c.channel})</span>
              </span>
              <span className="text-xs text-fg-subtle">
                {c.spend && `${formatCurrency(c.spend, currency)} · `}
                {t("leadsCount", { count: c._count.clients })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
