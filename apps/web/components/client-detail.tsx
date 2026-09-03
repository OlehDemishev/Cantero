"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SUPPORTED_LOCALES } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { CustomFieldsValuesPanel } from "@/components/custom-fields-values-panel";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

type ClientStage = "lead" | "contacted" | "qualified" | "won" | "lost";
const STAGES: ClientStage[] = ["lead", "contacted", "qualified", "won", "lost"];

type ActivityType = "note" | "call" | "meeting" | "email";
const ACTIVITY_TYPES: ActivityType[] = ["note", "call", "meeting", "email"];

interface Worker {
  id: string;
  name: string;
}
interface ReferralClient {
  id: string;
  name: string;
  stage: ClientStage;
}
interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: ClientStage;
  notes: string | null;
  estimatedValue: number | null;
  probability: number | null;
  expectedCloseDate: string | null;
  owner: Worker | null;
  lostReason: string | null;
  referredBy: { id: string; name: string } | null;
  referrals: ReferralClient[];
  referralRewardStatus: "none" | "pending" | "paid";
  referralRewardAmount: number | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  vatId: string | null;
  paymentTermsDays: number | null;
  preferredLocale: string | null;
  source: string | null;
  campaignId: string | null;
}
interface MarketingCampaign {
  id: string;
  name: string;
  channel: string;
}
interface Activity {
  id: string;
  type: ActivityType;
  content: string;
  createdAt: string;
}
interface Reminder {
  id: string;
  title: string;
  dueDate: string;
  done: boolean;
}

export function ClientDetail({ clientId }: { clientId: string }) {
  const t = useTranslations("clients");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";
  const isManager = me?.user.role === "owner" || me?.user.role === "admin";

  const [client, setClient] = useState<Client | null>(null);
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [allClients, setAllClients] = useState<ReferralClient[]>([]);
  const [notesInput, setNotesInput] = useState("");
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
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [billingForm, setBillingForm] = useState({
    street: "",
    city: "",
    postalCode: "",
    country: "",
    vatId: "",
    paymentTermsDays: "",
    preferredLocale: "",
  });
  const [billingSaved, setBillingSaved] = useState(false);
  const [activityForm, setActivityForm] = useState({ type: "note" as ActivityType, content: "" });
  const [reminderForm, setReminderForm] = useState({ title: "", dueDate: "" });
  const [busy, setBusy] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [losingStage, setLosingStage] = useState(false);
  const [lostReasonDraft, setLostReasonDraft] = useState("");
  const [converting, setConverting] = useState(false);
  const [convertForm, setConvertForm] = useState({ name: "", address: "" });

  function load() {
    apiFetch<Client>(`/clients/${clientId}`).then((c) => {
      setClient(c);
      setNotesInput(c.notes ?? "");
      setDealForm({
        estimatedValue: c.estimatedValue?.toString() ?? "",
        ownerWorkerId: c.owner?.id ?? "",
        referredByClientId: c.referredBy?.id ?? "",
        probability: c.probability?.toString() ?? "",
        expectedCloseDate: c.expectedCloseDate ? c.expectedCloseDate.slice(0, 10) : "",
        source: c.source ?? "",
        campaignId: c.campaignId ?? "",
      });
      setBillingForm({
        street: c.street ?? "",
        city: c.city ?? "",
        postalCode: c.postalCode ?? "",
        country: c.country ?? "",
        vatId: c.vatId ?? "",
        paymentTermsDays: c.paymentTermsDays?.toString() ?? "",
        preferredLocale: c.preferredLocale ?? "",
      });
    });
    apiFetch<Activity[]>(`/clients/${clientId}/activities`).then(setActivities);
    apiFetch<Reminder[]>(`/clients/${clientId}/reminders`).then(setReminders);
  }

  useEffect(() => {
    load();
    apiFetch<Worker[]>("/workers").then(setWorkers);
    apiFetch<ReferralClient[]>("/clients").then((cs) => setAllClients(cs.filter((c) => c.id !== clientId)));
    apiFetch<MarketingCampaign[]>("/marketing/campaigns").then(setCampaigns);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function moveStage(stage: ClientStage) {
    if (stage === "lost") {
      setLosingStage(true);
      setLostReasonDraft("");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/clients/${clientId}/move-stage`, { method: "POST", body: JSON.stringify({ stage }) });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmLost() {
    if (!lostReasonDraft.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/clients/${clientId}/move-stage`, {
        method: "POST",
        body: JSON.stringify({ stage: "lost", lostReason: lostReasonDraft }),
      });
      setLosingStage(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  function startConvert() {
    setConverting(true);
    setConvertForm({ name: client?.name ?? "", address: "" });
  }

  async function submitConvert(e: React.FormEvent) {
    e.preventDefault();
    const project = await apiFetch<{ id: string }>(`/clients/${clientId}/convert-to-project`, {
      method: "POST",
      body: JSON.stringify({ name: convertForm.name, address: convertForm.address || undefined }),
    });
    window.location.href = `/projects/${project.id}`;
  }

  async function saveNotes(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotesSaved(false);
    try {
      await apiFetch(`/clients/${clientId}`, { method: "PATCH", body: JSON.stringify({ notes: notesInput }) });
      setNotesSaved(true);
    } finally {
      setBusy(false);
    }
  }

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
    } finally {
      setBusy(false);
    }
  }

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
          paymentTermsDays: billingForm.paymentTermsDays ? Number(billingForm.paymentTermsDays) : null,
          preferredLocale: billingForm.preferredLocale || null,
        }),
      });
      setBillingSaved(true);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function addActivity(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/clients/${clientId}/activities`, { method: "POST", body: JSON.stringify(activityForm) });
      setActivityForm({ type: "note", content: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function addReminder(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/clients/${clientId}/reminders`, {
        method: "POST",
        body: JSON.stringify({ title: reminderForm.title, dueDate: new Date(reminderForm.dueDate).toISOString() }),
      });
      setReminderForm({ title: "", dueDate: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function completeReminder(reminderId: string) {
    await apiFetch(`/clients/${clientId}/reminders/${reminderId}/complete`, { method: "POST" });
    load();
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

  if (!client) {
    return (
      <AuthenticatedShell>
        <p className="text-gray-500">{tc("loading")}</p>
      </AuthenticatedShell>
    );
  }

  return (
    <AuthenticatedShell>
      <a href="/clients" className="text-sm text-gray-500 hover:underline">
        ← {t("title")}
      </a>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{client.name}</h1>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">{t(client.stage)}</span>
      </div>
      <p className="text-sm text-gray-500">{client.email ?? client.phone ?? "—"}</p>
      {client.estimatedValue != null && (
        <p className="mt-1 text-sm font-medium text-gray-700">
          {t("estimatedValue")}: {client.estimatedValue} {currency}
        </p>
      )}
      {client.owner && <p className="text-xs text-gray-400">{t("ownedBy", { name: client.owner.name })}</p>}
      {client.stage === "lost" && client.lostReason && (
        <p className="mt-1 text-xs text-error-600">
          {t("lostReason")}: {client.lostReason}
        </p>
      )}

      {losingStage ? (
        <div className="mt-4 flex max-w-md flex-col gap-2">
          <textarea
            rows={2}
            className="input"
            placeholder={t("lostReasonPlaceholder")}
            value={lostReasonDraft}
            onChange={(e) => setLostReasonDraft(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={confirmLost} disabled={busy || !lostReasonDraft.trim()} className="btn-secondary px-3 py-1 text-xs">
              {t("confirmLoss")}
            </button>
            <button onClick={() => setLosingStage(false)} className="btn-secondary px-3 py-1 text-xs">
              {tc("cancel")}
            </button>
          </div>
        </div>
      ) : converting ? (
        <form onSubmit={submitConvert} className="mt-4 flex max-w-md flex-col gap-2">
          <input
            required
            className="input"
            placeholder={t("projectName")}
            value={convertForm.name}
            onChange={(e) => setConvertForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary px-3 py-1 text-xs">
              {t("convertToProject")}
            </button>
            <button type="button" onClick={() => setConverting(false)} className="btn-secondary px-3 py-1 text-xs">
              {tc("cancel")}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap gap-1">
          {STAGES.filter((s) => s !== client.stage).map((s) => (
            <button key={s} onClick={() => moveStage(s)} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
              → {t(s)}
            </button>
          ))}
          {client.stage === "won" && (
            <button onClick={startConvert} className="btn-primary px-2 py-1 text-xs">
              {t("convertToProject")}
            </button>
          )}
        </div>
      )}

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
        {client && client.referrals.length > 0 && (
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

      <div className="mt-6 card max-w-md">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("billingAddress")}</h2>
        <p className="mb-3 text-xs text-gray-500">{t("billingAddressHint")}</p>
        <form onSubmit={saveBilling} className="flex flex-col gap-2">
          <input
            className="input"
            placeholder={t("street")}
            value={billingForm.street}
            onChange={(e) => setBillingForm((f) => ({ ...f, street: e.target.value }))}
          />
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={t("city")}
              value={billingForm.city}
              onChange={(e) => setBillingForm((f) => ({ ...f, city: e.target.value }))}
            />
            <input
              className="input w-24"
              placeholder={t("postalCode")}
              value={billingForm.postalCode}
              onChange={(e) => setBillingForm((f) => ({ ...f, postalCode: e.target.value }))}
            />
            <input
              className="input w-16"
              placeholder={t("countryCode")}
              maxLength={2}
              value={billingForm.country}
              onChange={(e) => setBillingForm((f) => ({ ...f, country: e.target.value.toUpperCase() }))}
            />
          </div>
          <input
            className="input"
            placeholder={t("vatIdPlaceholder")}
            value={billingForm.vatId}
            onChange={(e) => setBillingForm((f) => ({ ...f, vatId: e.target.value }))}
          />
          <label className="flex w-40 flex-col gap-1 text-xs text-gray-500">
            {t("paymentTermsDays")}
            <input
              type="number"
              min="0"
              max="365"
              className="input"
              placeholder={t("paymentTermsDaysPlaceholder")}
              value={billingForm.paymentTermsDays}
              onChange={(e) => setBillingForm((f) => ({ ...f, paymentTermsDays: e.target.value }))}
            />
          </label>
          <label className="flex w-40 flex-col gap-1 text-xs text-gray-500">
            {t("preferredLocale")}
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
          </label>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy} className="btn-secondary self-start">
              {tc("save")}
            </button>
            {billingSaved && <span className="text-xs text-success-700">{tc("saved")}</span>}
          </div>
        </form>
      </div>

      <CustomFieldsValuesPanel entityType="client" entityId={clientId} />

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("activity")}</h2>
          {!activities ? (
            <p className="text-sm text-gray-400">{tc("loading")}</p>
          ) : activities.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noActivity")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {activities.map((a) => (
                <li key={a.id} className="card">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {t(a.type)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-800">{a.content}</p>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={addActivity} className="mt-4 flex flex-col gap-2">
            <div className="flex gap-2">
              <select
                className="input w-auto"
                value={activityForm.type}
                onChange={(e) => setActivityForm((f) => ({ ...f, type: e.target.value as ActivityType }))}
              >
                {ACTIVITY_TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {t(ty)}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={busy || !activityForm.content} className="btn-secondary">
                {t("logActivity")}
              </button>
            </div>
            <textarea
              required
              rows={2}
              placeholder={t("activityContent")}
              className="input"
              value={activityForm.content}
              onChange={(e) => setActivityForm((f) => ({ ...f, content: e.target.value }))}
            />
          </form>

          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{t("notes")}</h2>
          <form onSubmit={saveNotes} className="flex flex-col gap-2">
            <textarea
              rows={4}
              className="input"
              value={notesInput}
              onChange={(e) => {
                setNotesInput(e.target.value);
                setNotesSaved(false);
              }}
            />
            <div className="flex items-center gap-2">
              <button type="submit" disabled={busy} className="btn-secondary self-start">
                {tc("save")}
              </button>
              {notesSaved && <span className="text-xs text-success-700">{tc("saved")}</span>}
            </div>
          </form>
        </div>

        <div className="lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("reminders")}</h2>
          {!reminders ? (
            <p className="text-sm text-gray-400">{tc("loading")}</p>
          ) : reminders.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noReminders")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {reminders.map((r) => (
                <li key={r.id} className="card flex items-center justify-between">
                  <div>
                    <div className={`text-sm font-medium ${r.done ? "text-gray-400 line-through" : "text-gray-900"}`}>
                      {r.title}
                    </div>
                    <div className="text-xs text-gray-500">{new Date(r.dueDate).toLocaleDateString()}</div>
                  </div>
                  {!r.done && (
                    <button onClick={() => completeReminder(r.id)} className="btn-secondary px-2 py-1 text-xs">
                      {t("complete")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={addReminder} className="mt-4 flex flex-col gap-2">
            <input
              required
              placeholder={t("reminderTitle")}
              className="input"
              value={reminderForm.title}
              onChange={(e) => setReminderForm((f) => ({ ...f, title: e.target.value }))}
            />
            <input
              required
              type="date"
              className="input"
              value={reminderForm.dueDate}
              onChange={(e) => setReminderForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
            <button type="submit" disabled={busy} className="btn-secondary self-start">
              {t("addReminder")}
            </button>
          </form>
        </div>
      </div>
    </AuthenticatedShell>
  );
}
