"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MEMBERSHIP_ROLES_MANAGEABLE } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";

interface Invite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}

export function TeamInvitesPanel() {
  const t = useTranslations("settings");
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "worker" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Invite[]>("/company/invites").then(setInvites);
  }

  useEffect(load, []);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/company/invites", { method: "POST", body: JSON.stringify(inviteForm) });
      setInviteForm({ email: "", role: "worker" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("seatLimitReached"));
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvite(id: string) {
    if (!window.confirm(t("confirmRevokeInvite"))) return;
    await apiFetch(`/company/invites/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("invites")}</h2>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{t("inviteEmailHint")}</p>
      {error && <p className="mb-3 rounded-md bg-red-50 dark:bg-red-500/15 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {!invites || invites.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noInvites")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {invites.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2">
              <span className="text-sm">
                {inv.email} · {t(inv.role)}
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
  );
}
