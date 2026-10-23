"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { formatDateTime } from "@/lib/format-date";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Session {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  ipAddress: string | null;
}

export function SessionsPanel() {
  const t = useTranslations("sessions");
  const confirm = useConfirm();
  const td = useTranslations("dialog");
  const tc = useTranslations("common");
  const { data: sessions = null, reload: reloadSessions } = useApi<Session[]>("/auth/sessions");
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadSessions();
  }

  async function revoke(id: string) {
    if (!(await confirm({ message: td("revokeSession"), tone: "danger", verb: "revoke" }))) return;
    setBusy(true);
    try {
      await apiFetch(`/auth/sessions/${id}`, { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <p className="mb-4 text-xs text-fg-subtle">{t("hint")}</p>

      {!sessions ? (
        <p className="text-sm text-fg-subtle">{tc("loading")}</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noSessions")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2 text-sm">
              <div>
                <div className="text-fg-muted">{s.userAgent ?? t("unknownDevice")}</div>
                <div className="text-xs text-fg-subtle">
                  {s.ipAddress ?? "—"} · {t("lastSeen", { date: formatDateTime(new Date(s.lastSeenAt)) })}
                </div>
              </div>
              <button onClick={() => revoke(s.id)} disabled={busy} className="text-xs text-danger-fg hover:underline">
                {t("revoke")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
