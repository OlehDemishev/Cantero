"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api-client";

interface Broadcast {
  id: string;
  message: string;
  recipientCount: number;
  sentByName: string;
  createdAt: string;
}

export function CrewSmsBroadcastPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("crewSmsBroadcast");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<Broadcast[] | null>(null);

  function load() {
    apiFetch<Broadcast[]>(`/crew-sms-broadcasts?projectId=${projectId}`).then(setLog);
  }

  useEffect(load, [projectId]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/crew-sms-broadcasts", { method: "POST", body: JSON.stringify({ message, projectId }) });
      setMessage("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <div className="card">
        <form onSubmit={handleSend} className="flex flex-col gap-2">
          <textarea
            className="input h-20"
            placeholder={t("placeholder")}
            value={message}
            maxLength={480}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">{message.length}/480</span>
            <button type="submit" disabled={busy || !message.trim()} className="btn-primary px-3 py-1.5 text-xs">
              {busy ? t("sending") : t("send")}
            </button>
          </div>
        </form>
        {error && <p className="mt-2 text-xs text-error-700">{error}</p>}

        {log && log.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-3">
            {log.map((b) => (
              <li key={b.id} className="text-xs text-gray-500">
                <span className="text-gray-700">{b.message}</span>
                <span className="ml-1 text-gray-400">
                  — {t("recipientCount", { count: b.recipientCount })}, {b.sentByName}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
