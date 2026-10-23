"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format-date";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

interface PortalMessage {
  id: string;
  authorUserId: string | null;
  authorClientId: string | null;
  authorName: string;
  content: string;
  createdAt: string;
}

/** Staff-side view of the client project message thread — see PortalMessagesService on the API
 * side for why this is a separate model/UI from the internal CommentsThread. */
export function PortalMessagesPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("portalMessages");
  const tc = useTranslations("common");

  const [messages, setMessages] = useState<PortalMessage[] | null>(null);
  const [messagesError, setMessagesError] = useState<Error | null>(null);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  function load() {
    apiFetch<PortalMessage[]>(`/projects/${projectId}/portal-messages`).then((list) => {
      setMessagesError(null);
      setMessages(list);
      setTimeout(() => bottomRef.current?.scrollIntoView({ block: "end" }), 0);
    }).catch(setMessagesError);
  }

  useEffect(load, [projectId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/portal-messages`, {
        method: "POST",
        body: JSON.stringify({ content: content.trim() }),
      });
      setContent("");
      load();
    } finally {
      setBusy(false);
    }
  }

  if (messages === null) return messagesError ? <ErrorState error={messagesError} onRetry={load} compact /> : <Skeleton lines={3} />;

  return (
    <div className="mt-8">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("hint")}</p>

      <div className="card flex flex-col">
        <div className="flex max-h-96 min-h-[120px] flex-col gap-3 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t("noMessages")}</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`max-w-[80%] ${m.authorUserId ? "self-end text-right" : "self-start"}`}>
                <div
                  className={`inline-block rounded-lg px-3 py-2 text-sm ${
                    m.authorUserId ? "bg-brand-500 text-white" : "bg-gray-100 dark:bg-gray-700 text-fg"
                  }`}
                >
                  {m.content}
                </div>
                <div className="mt-1 text-xs text-fg-subtle">
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
            {tc("send")}
          </button>
        </form>
      </div>
    </div>
  );
}
