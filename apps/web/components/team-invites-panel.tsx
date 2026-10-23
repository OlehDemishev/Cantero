"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { useAssignableRoles } from "@/lib/permissions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Alert } from "@/components/ui/alert";

interface Invite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}

export function TeamInvitesPanel() {
  const t = useTranslations("settings");
  const confirm = useConfirm();
  const { data: invites = null, reload: reloadInvites } = useApi<Invite[]>("/company/invites");
  const { roles: assignableRoles } = useAssignableRoles();
  const [inviteForm, setInviteForm] = useState({ email: "", role: "worker" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    void reloadInvites();
  }

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
    if (!(await confirm({ message: t("confirmRevokeInvite"), tone: "danger", verb: "revoke" }))) return;
    await apiFetch(`/company/invites/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("invites")}</h2>
      <p className="mb-4 text-xs text-fg-subtle">{t("inviteEmailHint")}</p>
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      {!invites || invites.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noInvites")}</p>
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
          placeholder={t("inviteEmail")} aria-label={t("inviteEmail")}
          className="input w-auto"
          value={inviteForm.email}
          onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
        />
        <select aria-label={t("role")}
          className="input w-auto"
          value={inviteForm.role}
          onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value }))}
        >
          {assignableRoles.map((r) => (
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
