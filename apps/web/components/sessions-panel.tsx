"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format-date";

interface Session {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  ipAddress: string | null;
}

export function SessionsPanel() {
  const t = useTranslations("sessions");
  const tc = useTranslations("common");
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Session[]>("/auth/sessions").then(setSessions);
  }

  useEffect(load, []);

  async function revoke(id: string) {
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
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-4 text-xs text-gray-500">{t("hint")}</p>

      {!sessions ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-gray-400">—</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between border-b border-gray-100 pb-2 text-sm">
              <div>
                <div className="text-gray-700">{s.userAgent ?? t("unknownDevice")}</div>
                <div className="text-xs text-gray-400">
                  {s.ipAddress ?? "—"} · {t("lastSeen", { date: formatDateTime(new Date(s.lastSeenAt)) })}
                </div>
              </div>
              <button onClick={() => revoke(s.id)} disabled={busy} className="text-xs text-error-700 hover:underline">
                {t("revoke")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
