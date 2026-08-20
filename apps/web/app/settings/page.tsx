"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SUPPORTED_LOCALES, MEMBERSHIP_ROLES_MANAGEABLE, WEBHOOK_EVENTS, type WebhookEvent } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch, apiUpload } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { isPushSupported, getExistingSubscription, enablePush, disablePush } from "@/lib/push";

interface Company {
  name: string;
  locale: string;
  brandColor: string | null;
}
interface Plan {
  id: string;
  code: string;
  name: string;
  pricePerSeat: string;
  currency: string;
}
interface Subscription {
  seats: number;
  status: string;
  plan: Plan;
}
interface Member {
  userId: string;
  role: string;
  user: { id: string; email: string; name: string };
}
interface Invite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}
interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
interface AuditLogEntry {
  id: string;
  actorName: string;
  summary: string;
  createdAt: string;
}
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

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const isManager = me?.user.role === "owner" || me?.user.role === "admin";

  const [companyForm, setCompanyForm] = useState<{ name: string; locale: string; brandColor: string | null }>({
    name: "",
    locale: "en",
    brandColor: null,
  });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [seatsInput, setSeatsInput] = useState("1");
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "worker" });
  const [apiKeys, setApiKeys] = useState<ApiKey[] | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[] | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[] | null>(null);
  const [webhookForm, setWebhookForm] = useState<{ url: string; events: WebhookEvent[] }>({ url: "", events: [] });
  const [createdWebhookSecret, setCreatedWebhookSecret] = useState<string | null>(null);
  const [webhookSecretCopied, setWebhookSecretCopied] = useState(false);
  const [expandedWebhookId, setExpandedWebhookId] = useState<string | null>(null);
  const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDelivery[] | null>(null);
  const [pushStatus, setPushStatus] = useState<"checking" | "unsupported" | "enabled" | "disabled">("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadLogo() {
    apiFetch<Blob>("/company/logo")
      .then((blob) => setLogoUrl(URL.createObjectURL(blob)))
      .catch(() => setLogoUrl(null));
  }

  function loadAll() {
    apiFetch<Company>("/company").then((c) =>
      setCompanyForm({ name: c.name, locale: c.locale, brandColor: c.brandColor }),
    );
    loadLogo();
    apiFetch<Subscription>("/billing/subscription").then((s) => {
      setSubscription(s);
      setSeatsInput(String(s.seats));
    });
    apiFetch<Plan[]>("/billing/plans").then(setPlans);
    apiFetch<Member[]>("/company/members").then(setMembers);
    if (isManager) {
      apiFetch<Invite[]>("/company/invites").then(setInvites);
      apiFetch<ApiKey[]>("/company/api-keys").then(setApiKeys);
      apiFetch<AuditLogEntry[]>("/company/audit-log").then(setAuditLog);
      apiFetch<WebhookEndpoint[]>("/company/webhooks").then(setWebhooks);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager]);

  useEffect(() => {
    if (!isPushSupported()) {
      setPushStatus("unsupported");
      return;
    }
    getExistingSubscription().then((sub) => setPushStatus(sub ? "enabled" : "disabled"));
  }, []);

  async function togglePush() {
    setPushBusy(true);
    setPushError(null);
    try {
      if (pushStatus === "enabled") {
        await disablePush();
        setPushStatus("disabled");
      } else {
        await enablePush();
        setPushStatus("enabled");
      }
    } catch (err) {
      setPushError(err instanceof Error && err.message === "denied" ? t("pushPermissionDenied") : tc("error"));
    } finally {
      setPushBusy(false);
    }
  }

  async function saveCompany(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/company", { method: "PATCH", body: JSON.stringify(companyForm) });
      document.cookie = `NEXT_LOCALE=${companyForm.locale};path=/;max-age=31536000`;
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoBusy(true);
    setLogoError(null);
    try {
      await apiUpload("/company/logo", file);
      loadLogo();
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setLogoBusy(false);
      e.target.value = "";
    }
  }

  async function changePlan(planCode: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/billing/change-plan", { method: "POST", body: JSON.stringify({ planCode }) });
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function updateSeats(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/billing/seats", { method: "POST", body: JSON.stringify({ seats: Number(seatsInput) }) });
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function updateMemberRole(userId: string, role: string) {
    await apiFetch(`/company/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) });
    loadAll();
  }

  async function removeMember(userId: string) {
    await apiFetch(`/company/members/${userId}`, { method: "DELETE" });
    loadAll();
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/company/invites", { method: "POST", body: JSON.stringify(inviteForm) });
      setInviteForm({ email: "", role: "worker" });
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("seatLimitReached"));
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvite(id: string) {
    await apiFetch(`/company/invites/${id}`, { method: "DELETE" });
    loadAll();
  }

  async function createApiKey(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setKeyCopied(false);
    try {
      const created = await apiFetch<{ key: string }>("/company/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: newKeyName }),
      });
      setCreatedKey(created.key);
      setNewKeyName("");
      loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function copyApiKey() {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setKeyCopied(true);
  }

  async function revokeApiKey(id: string) {
    await apiFetch(`/company/api-keys/${id}`, { method: "DELETE" });
    loadAll();
  }

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
      loadAll();
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
    loadAll();
  }

  async function regenerateWebhookSecret(id: string) {
    setWebhookSecretCopied(false);
    const result = await apiFetch<{ secret: string }>(`/company/webhooks/${id}/regenerate-secret`, { method: "POST" });
    setCreatedWebhookSecret(result.secret);
  }

  async function deleteWebhook(id: string) {
    await apiFetch(`/company/webhooks/${id}`, { method: "DELETE" });
    if (expandedWebhookId === id) setExpandedWebhookId(null);
    loadAll();
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
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {pushStatus !== "unsupported" && (
        <section className="card mt-6">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("pushNotifications")}</h2>
          <p className="mb-4 text-xs text-gray-500">{t("pushNotificationsHint")}</p>
          {pushError && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{pushError}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={togglePush}
              disabled={pushBusy || pushStatus === "checking"}
              className={pushStatus === "enabled" ? "btn-secondary" : "btn-primary"}
            >
              {pushBusy
                ? tc("loading")
                : pushStatus === "enabled"
                  ? t("disablePush")
                  : t("enablePush")}
            </button>
            {pushStatus === "enabled" && <span className="text-sm text-green-700">{t("pushEnabled")}</span>}
          </div>
        </section>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">{t("company")}</h2>
          <form onSubmit={saveCompany} className="flex flex-col gap-3">
            <label className="text-xs text-gray-500">
              {t("companyName")}
              <input
                required
                className="input mt-1"
                value={companyForm.name}
                onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))}
                disabled={!isManager}
              />
            </label>
            <label className="text-xs text-gray-500">
              {t("language")}
              <select
                className="input mt-1"
                value={companyForm.locale}
                onChange={(e) => setCompanyForm((f) => ({ ...f, locale: e.target.value }))}
                disabled={!isManager}
              >
                {SUPPORTED_LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            {isManager && (
              <button type="submit" disabled={busy} className="btn-primary">
                {t("save")}
              </button>
            )}
          </form>

          <div className="mt-6 border-t border-gray-100 pt-4">
            <h3 className="mb-1 text-sm font-semibold text-gray-700">{t("branding")}</h3>
            <p className="mb-3 text-xs text-gray-500">{t("brandingHint")}</p>
            {logoError && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{logoError}</p>}
            <div className="flex flex-col gap-3">
              <label className="text-xs text-gray-500">
                {t("brandColor")}
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-14 cursor-pointer rounded border border-gray-200"
                    value={companyForm.brandColor ?? "#465fff"}
                    onChange={(e) => setCompanyForm((f) => ({ ...f, brandColor: e.target.value }))}
                    disabled={!isManager}
                  />
                  {companyForm.brandColor && isManager && (
                    <button
                      type="button"
                      onClick={() => setCompanyForm((f) => ({ ...f, brandColor: null }))}
                      className="btn-secondary px-2 py-1 text-xs"
                    >
                      {t("resetBrandColor")}
                    </button>
                  )}
                </div>
              </label>
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  <img src={logoUrl} alt={t("logo")} className="h-12 max-w-[120px] rounded border border-gray-200 object-contain" />
                ) : (
                  <span className="text-xs text-gray-400">{t("noLogo")}</span>
                )}
                {isManager && (
                  <label className="btn-secondary cursor-pointer px-3 py-1 text-xs">
                    {logoBusy ? tc("loading") : t("uploadLogo")}
                    <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={uploadLogo} disabled={logoBusy} />
                  </label>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">{t("plan")}</h2>
          <div className="flex flex-col gap-2">
            {plans.map((plan) => {
              const isCurrent = subscription?.plan.code === plan.code;
              return (
                <div
                  key={plan.id}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 ${isCurrent ? "border-gray-900 bg-gray-50" : "border-gray-200"}`}
                >
                  <div>
                    <div className="text-sm font-medium">
                      {plan.name} {isCurrent && `· ${t("currentPlan")}`}
                    </div>
                    <div className="text-xs text-gray-500">
                      {plan.pricePerSeat} {plan.currency} / seat / mo
                    </div>
                  </div>
                  {isManager && !isCurrent && (
                    <button onClick={() => changePlan(plan.code)} disabled={busy} className="btn-secondary px-3 py-1 text-xs">
                      {t("changePlan")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {subscription && members && (
            <p className="mt-3 text-xs text-gray-500">
              {t("seatsUsed", { used: members.length, total: subscription.seats })}
            </p>
          )}

          {isManager && (
            <form onSubmit={updateSeats} className="mt-4 flex items-end gap-2">
              <label className="text-xs text-gray-500">
                {t("seats")}
                <input
                  type="number"
                  min="1"
                  className="input mt-1 w-24"
                  value={seatsInput}
                  onChange={(e) => setSeatsInput(e.target.value)}
                />
              </label>
              <button type="submit" disabled={busy} className="btn-secondary">
                {t("updateSeats")}
              </button>
            </form>
          )}
        </section>

        <section className="card lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">{t("members")}</h2>
          {!members ? (
            <p className="text-gray-500">{tc("loading")}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">{tc("name")}</th>
                  <th>{tc("email")}</th>
                  <th>{t("role")}</th>
                  {isManager && <th></th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId} className="border-b border-gray-100">
                    <td className="py-2">{m.user.name}</td>
                    <td>{m.user.email}</td>
                    <td>
                      {isManager && m.role !== "owner" ? (
                        <select
                          className="input w-auto"
                          value={m.role}
                          onChange={(e) => updateMemberRole(m.userId, e.target.value)}
                        >
                          {MEMBERSHIP_ROLES_MANAGEABLE.map((r) => (
                            <option key={r} value={r}>
                              {t(r)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        t(m.role as any)
                      )}
                    </td>
                    {isManager && (
                      <td>
                        {m.role !== "owner" && (
                          <button onClick={() => removeMember(m.userId)} className="btn-secondary px-2 py-1 text-xs">
                            {t("remove")}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {isManager && (
          <section className="card lg:col-span-2">
            <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("invites")}</h2>
            <p className="mb-4 text-xs text-gray-500">{t("inviteEmailHint")}</p>
            {!invites || invites.length === 0 ? (
              <p className="text-sm text-gray-400">{t("noInvites")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {invites.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
                    <span className="text-sm">
                      {inv.email} · {t(inv.role as any)}
                    </span>
                    <button onClick={() => revokeInvite(inv.id)} className="btn-secondary px-2 py-1 text-xs">
                      {t("revoke")}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={sendInvite} className="mt-4 flex flex-wrap items-end gap-2">
              <input
                required
                type="email"
                placeholder={t("inviteEmail")}
                className="input w-auto"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
              />
              <select
                className="input w-auto"
                value={inviteForm.role}
                onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value }))}
              >
                {MEMBERSHIP_ROLES_MANAGEABLE.map((r) => (
                  <option key={r} value={r}>
                    {t(r)}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={busy} className="btn-primary">
                {t("sendInvite")}
              </button>
            </form>
          </section>
        )}

        {isManager && (
          <section className="card lg:col-span-2">
            <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("apiKeys")}</h2>
            <p className="mb-4 text-xs text-gray-500">{t("apiKeysHint")}</p>

            {createdKey && (
              <div className="mb-4 rounded-md border border-warning-200 bg-warning-50 px-3 py-2">
                <p className="text-xs text-warning-700">{t("apiKeyShownOnce")}</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs">{createdKey}</code>
                  <button onClick={copyApiKey} className="btn-secondary shrink-0 px-3 py-1 text-xs">
                    {keyCopied ? tc("saved") : t("copyKey")}
                  </button>
                </div>
              </div>
            )}

            {!apiKeys || apiKeys.length === 0 ? (
              <p className="text-sm text-gray-400">{t("noApiKeys")}</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2">{tc("name")}</th>
                    <th>{t("apiKeyPrefix")}</th>
                    <th>{t("apiKeyLastUsed")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((k) => (
                    <tr key={k.id} className="border-b border-gray-100">
                      <td className="py-2">{k.name}</td>
                      <td className="font-mono text-xs text-gray-500">{k.keyPrefix}…</td>
                      <td className="text-xs text-gray-500">
                        {k.revokedAt
                          ? t("apiKeyRevoked")
                          : k.lastUsedAt
                            ? new Date(k.lastUsedAt).toLocaleDateString()
                            : t("apiKeyNeverUsed")}
                      </td>
                      <td>
                        {!k.revokedAt && (
                          <button onClick={() => revokeApiKey(k.id)} className="btn-secondary px-2 py-1 text-xs">
                            {t("revoke")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <form onSubmit={createApiKey} className="mt-4 flex items-end gap-2">
              <input
                required
                placeholder={t("apiKeyNamePlaceholder")}
                className="input"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
              <button type="submit" disabled={busy} className="btn-primary shrink-0">
                {t("createApiKey")}
              </button>
            </form>
          </section>
        )}

        {isManager && (
          <section className="card lg:col-span-2">
            <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("webhooks")}</h2>
            <p className="mb-4 text-xs text-gray-500">{t("webhooksHint")}</p>

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
                              {t(`webhookEvent_${ev.replace(".", "_")}` as any)}
                            </span>
                          ))}
                        </p>
                        <p className="mt-1 text-xs text-gray-400">
                          {w.lastDeliveryAt ? (
                            <span className={w.lastDeliveryStatus === "success" ? "text-success-600" : "text-error-600"}>
                              {t("lastDelivery")}: {t(w.lastDeliveryStatus === "success" ? "webhookSuccess" : "webhookFailed")} ·{" "}
                              {new Date(w.lastDeliveryAt).toLocaleString()}
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
                                <span className="text-gray-400">{new Date(d.createdAt).toLocaleString()}</span>
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
              <div className="flex flex-wrap gap-2">
                {WEBHOOK_EVENTS.map((ev) => (
                  <label key={ev} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={webhookForm.events.includes(ev)}
                      onChange={() => toggleWebhookEvent(ev)}
                    />
                    {t(`webhookEvent_${ev.replace(".", "_")}` as any)}
                  </label>
                ))}
              </div>
              <button type="submit" disabled={busy || webhookForm.events.length === 0} className="btn-primary self-start">
                {t("createWebhook")}
              </button>
            </form>
          </section>
        )}

        {isManager && (
          <section className="card lg:col-span-2">
            <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("auditLog")}</h2>
            <p className="mb-4 text-xs text-gray-500">{t("auditLogHint")}</p>

            {!auditLog ? (
              <p className="text-gray-500">{tc("loading")}</p>
            ) : auditLog.length === 0 ? (
              <p className="text-sm text-gray-400">{t("noAuditLog")}</p>
            ) : (
              <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
                {auditLog.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between border-b border-gray-100 pb-2 text-sm">
                    <div>
                      <span className="font-medium text-gray-800">{entry.actorName}</span>{" "}
                      <span className="text-gray-600">{entry.summary}</span>
                    </div>
                    <span className="shrink-0 pl-3 text-xs text-gray-400">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </AuthenticatedShell>
  );
}
