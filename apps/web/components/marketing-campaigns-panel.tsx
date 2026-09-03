"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

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
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [form, setForm] = useState({ name: "", channel: "", spend: "", startDate: "", endDate: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Campaign[]>("/marketing/campaigns").then(setCampaigns);
  }
  useEffect(load, []);

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
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("campaignsTitle")}</h2>
      <p className="mb-4 text-sm text-gray-500">{t("campaignsHint")}</p>

      <form onSubmit={createCampaign} className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <input
          required
          placeholder={t("campaignNamePlaceholder")}
          className="input"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          required
          placeholder={t("channelPlaceholder")}
          className="input"
          value={form.channel}
          onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
        />
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          {t("spend")}
          <input
            type="number"
            step="0.01"
            min="0"
            className="input w-32"
            value={form.spend}
            onChange={(e) => setForm((f) => ({ ...f, spend: e.target.value }))}
          />
        </label>
        <button type="submit" disabled={busy} className="btn-primary shrink-0">
          {t("addCampaign")}
        </button>
      </form>

      {campaigns === null ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noCampaigns")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {campaigns.map((c) => (
            <li key={c.id} className="card flex items-center justify-between text-sm">
              <span>
                {c.name} <span className="text-xs text-gray-400">({c.channel})</span>
              </span>
              <span className="text-xs text-gray-500">
                {c.spend && `${c.spend} ${currency} · `}
                {t("leadsCount", { count: c._count.clients })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
