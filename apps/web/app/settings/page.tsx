"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SUPPORTED_LOCALES, MEMBERSHIP_ROLES_MANAGEABLE } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface Company {
  name: string;
  locale: string;
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

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const isManager = me?.user.role === "owner" || me?.user.role === "admin";

  const [companyForm, setCompanyForm] = useState({ name: "", locale: "en" });
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [seatsInput, setSeatsInput] = useState("1");
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "worker" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadAll() {
    apiFetch<Company>("/company").then((c) => setCompanyForm({ name: c.name, locale: c.locale }));
    apiFetch<Subscription>("/billing/subscription").then((s) => {
      setSubscription(s);
      setSeatsInput(String(s.seats));
    });
    apiFetch<Plan[]>("/billing/plans").then(setPlans);
    apiFetch<Member[]>("/company/members").then(setMembers);
    if (isManager) apiFetch<Invite[]>("/company/invites").then(setInvites);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager]);

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

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

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
            <h2 className="mb-4 text-sm font-semibold text-gray-700">{t("invites")}</h2>
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
      </div>
    </AuthenticatedShell>
  );
}
