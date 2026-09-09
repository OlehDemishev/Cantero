"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getPortalToken, portalApiFetch } from "@/lib/portal-api-client";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format-date";

type TicketStatus = "open" | "in_progress" | "waiting_on_customer" | "resolved" | "closed";
interface TicketMessage {
  id: string;
  content: string;
  authorName: string;
  authorUserId: string | null;
  createdAt: string;
}
interface TicketDetail {
  id: string;
  subject: string;
  status: TicketStatus;
  createdAt: string;
  messages: TicketMessage[];
}

export default function PortalTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("portal");
  const router = useRouter();

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  function load() {
    portalApiFetch<TicketDetail>(`/portal/tickets/${id}`)
      .then((t) => {
        setTicket(t);
        setTimeout(() => bottomRef.current?.scrollIntoView({ block: "end" }), 0);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t.toString()));
  }

  useEffect(() => {
    if (!getPortalToken()) {
      router.replace("/portal/login");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    try {
      await portalApiFetch(`/portal/tickets/${id}/messages`, { method: "POST", body: JSON.stringify({ content: content.trim() }) });
      setContent("");
      load();
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
        <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
      <div className="flex w-full max-w-2xl flex-col">
        <a href="/portal" className="mb-4 inline-block text-xs text-gray-500 dark:text-gray-400 hover:underline">
          ← {t("back")}
        </a>
        {!ticket ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">{t("loading")}</p>
        ) : (
          <div className="card flex flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50">{ticket.subject}</h1>
              <span className="rounded-full bg-brand-50 dark:bg-brand-500/15 px-2 py-0.5 text-xs font-medium text-brand-700 dark:text-brand-400">
                {t(`ticketStatus_${ticket.status}`)}
              </span>
            </div>

            <div className="flex max-h-[60vh] min-h-[200px] flex-col gap-3 overflow-y-auto">
              {ticket.messages.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">{t("noMessages")}</p>
              ) : (
                ticket.messages.map((m) => (
                  <div key={m.id} className={`max-w-[80%] ${!m.authorUserId ? "self-end text-right" : "self-start"}`}>
                    <div className={`inline-block rounded-lg px-3 py-2 text-sm ${!m.authorUserId ? "bg-brand-500 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100"}`}>
                      {m.content}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                      {m.authorName} · {formatDateTime(new Date(m.createdAt))}
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={send} className="mt-4 flex items-end gap-2 border-t border-gray-100 dark:border-gray-700 pt-4">
              <textarea
                required
                rows={2}
                className="input flex-1"
                placeholder={t("messagePlaceholder")}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <button type="submit" disabled={busy} className="btn-primary">
                {t("send")}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
