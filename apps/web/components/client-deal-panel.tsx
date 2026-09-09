"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

type ClientStage = "lead" | "contacted" | "qualified" | "won" | "lost";
interface Worker {
  id: string;
  name: string;
}
interface ReferralClient {
  id: string;
  name: string;
  stage: ClientStage;
}
interface MarketingCampaign {
  id: string;
  name: string;
  channel: string;
}
interface Client {
  estimatedValue: number | null;
  probability: number | null;
  expectedCloseDate: string | null;
  owner: Worker | null;
  referredBy: { id: string; name: string } | null;
  referrals: ReferralClient[];
  referralRewardStatus: "none" | "pending" | "paid";
  referralRewardAmount: number | null;
  source: string | null;
  campaignId: string | null;
}

/** Deal-stage fields (value, owner, probability, source/campaign) plus referrals and the referral
 * reward — grouped because they all live in the same "deal" card. `onChanged` lets the parent
 * refresh its header (which shows estimatedValue/owner) after a save. */
export function ClientDealPanel({
  clientId,
  currency,
  isManager,
  onChanged,
}: {
  clientId: string;
  currency: string;
  isManager: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("clients");
  const tc = useTranslations("common");

  const [client, setClient] = useState<Client | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [allClients, setAllClients] = useState<ReferralClient[]>([]);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [dealForm, setDealForm] = useState({
    estimatedValue: "",
    ownerWorkerId: "",
    referredByClientId: "",
    probability: "",
    expectedCloseDate: "",
    source: "",
    campaignId: "",
  });
  const [dealSaved, setDealSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Client>(`/clients/${clientId}`).then((c) => {
      setClient(c);
      setDealForm({
        estimatedValue: c.estimatedValue?.toString() ?? "",
        ownerWorkerId: c.owner?.id ?? "",
        referredByClientId: c.referredBy?.id ?? "",
        probability: c.probability?.toString() ?? "",
        expectedCloseDate: c.expectedCloseDate ? c.expectedCloseDate.slice(0, 10) : "",
        source: c.source ?? "",
        campaignId: c.campaignId ?? "",
      });
    });
  }

  useEffect(() => {
    load();
    apiFetch<Worker[]>("/workers").then(setWorkers);
    apiFetch<ReferralClient[]>("/clients").then((cs) => setAllClients(cs.filter((c) => c.id !== clientId)));
    apiFetch<MarketingCampaign[]>("/marketing/campaigns").then(setCampaigns);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function saveDeal(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setDealSaved(false);
    try {
      await apiFetch(`/clients/${clientId}`, {
        method: "PATCH",
        body: JSON.stringify({
          estimatedValue: dealForm.estimatedValue ? Number(dealForm.estimatedValue) : null,
          ownerWorkerId: dealForm.ownerWorkerId || null,
          referredByClientId: dealForm.referredByClientId || null,
          probability: dealForm.probability ? Number(dealForm.probability) : null,
          expectedCloseDate: dealForm.expectedCloseDate ? new Date(dealForm.expectedCloseDate).toISOString() : null,
          source: dealForm.source || null,
          campaignId: dealForm.campaignId || null,
        }),
      });
      setDealSaved(true);
      load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function markReferralRewardPaid() {
    setBusy(true);
    try {
      await apiFetch(`/clients/${clientId}/referral-reward`, { method: "PATCH", body: JSON.stringify({ status: "paid" }) });
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!client) return null;

  return (
    <div className="mt-6 card max-w-md">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("estimatedValue")} / {t("owner")}</h2>
      <form onSubmit={saveDeal} className="flex flex-col gap-2">
        <input
          type="number"
          min="0"
          className="input"
          placeholder={t("estimatedValue")}
          value={dealForm.estimatedValue}
          onChange={(e) => setDealForm((f) => ({ ...f, estimatedValue: e.target.value }))}
        />
        <select
          className="input"
          value={dealForm.ownerWorkerId}
          onChange={(e) => setDealForm((f) => ({ ...f, ownerWorkerId: e.target.value }))}
        >
          <option value="">{tc("none")}</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <label className="text-xs text-gray-500">
          {t("probability")}
          <input
            type="number"
            min="0"
            max="100"
            className="input mt-1"
            placeholder={t("probabilityPlaceholder")}
            value={dealForm.probability}
            onChange={(e) => setDealForm((f) => ({ ...f, probability: e.target.value }))}
          />
        </label>
        <label className="text-xs text-gray-500">
          {t("expectedCloseDate")}
          <input
            type="date"
            className="input mt-1"
            value={dealForm.expectedCloseDate}
            onChange={(e) => setDealForm((f) => ({ ...f, expectedCloseDate: e.target.value }))}
          />
        </label>
        <label className="text-xs text-gray-500">
          {t("source")}
          <input
            className="input mt-1"
            placeholder={t("sourcePlaceholder")}
            value={dealForm.source}
            onChange={(e) => setDealForm((f) => ({ ...f, source: e.target.value }))}
          />
        </label>
        <label className="text-xs text-gray-500">
          {t("campaign")}
          <select
            className="input mt-1"
            value={dealForm.campaignId}
            onChange={(e) => setDealForm((f) => ({ ...f, campaignId: e.target.value }))}
          >
            <option value="">{tc("none")}</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.channel})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          {t("referredBy")}
          <select
            className="input mt-1"
            value={dealForm.referredByClientId}
            onChange={(e) => setDealForm((f) => ({ ...f, referredByClientId: e.target.value }))}
          >
            <option value="">{tc("none")}</option>
            {allClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button type="submit" disabled={busy} className="btn-secondary self-start">
            {tc("save")}
          </button>
          {dealSaved && <span className="text-xs text-success-700">{tc("saved")}</span>}
        </div>
      </form>
      {client.referrals.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <h3 className="mb-1 text-xs font-semibold text-gray-500">{t("referrals")}</h3>
          <ul className="flex flex-col gap-1">
            {client.referrals.map((r) => (
              <li key={r.id}>
                <a href={`/clients/${r.id}`} className="text-xs text-brand-700 hover:underline">
                  {r.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {client.referralRewardStatus !== "none" && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <h3 className="mb-1 text-xs font-semibold text-gray-500">{t("referralReward")}</h3>
          <div className="flex items-center justify-between">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                client.referralRewardStatus === "paid" ? "bg-success-50 text-success-700" : "bg-amber-100 text-amber-800"
              }`}
            >
              {t(`referralReward_${client.referralRewardStatus}`)}
              {client.referralRewardAmount != null && ` · ${client.referralRewardAmount} ${currency}`}
            </span>
            {isManager && client.referralRewardStatus === "pending" && (
              <button onClick={markReferralRewardPaid} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                {t("markRewardPaid")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
