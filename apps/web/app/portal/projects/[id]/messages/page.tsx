"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getPortalToken, portalApiFetch } from "@/lib/portal-api-client";
import { formatDateTime } from "@/lib/format-date";
import { PublicLinkError } from "@/components/public-link-error";

interface PortalMessage {
  id: string;
  authorUserId: string | null;
  authorClientId: string | null;
  authorName: string;
  content: string;
  createdAt: string;
}

export default function PortalProjectMessagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("portal");
  const tp = useTranslations("publicLink");
  const router = useRouter();

  const [messages, setMessages] = useState<PortalMessage[] | null>(null);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  function load() {
    portalApiFetch<PortalMessage[]>(`/portal/projects/${id}/messages`)
      .then((list) => {
        setMessages(list);
        setTimeout(() => bottomRef.current?.scrollIntoView({ block: "end" }), 0);
      })
      .catch(setLoadError);
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
      await portalApiFetch(`/portal/projects/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: content.trim() }),
      });
      setContent("");
      load();
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <PublicLinkError
        error={loadError}
        action={
          <a href="/portal" className="btn-primary inline-block">
            {tp("backToPortal")}
          </a>
        }
      />
    );
  }

  return (
    <main className="flex min-h-screen justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
      <div className="flex w-full max-w-2xl flex-col">
        <a href="/portal" className="mb-4 inline-block text-xs text-fg-subtle hover:underline">
          ← {t("back")}
        </a>
        <div className="card flex flex-1 flex-col">
          <h1 className="mb-3 text-lg font-semibold text-fg">{t("messages")}</h1>

          <div className="flex max-h-[60vh] min-h-[200px] flex-col gap-3 overflow-y-auto">
            {!messages ? (
              <p className="text-sm text-fg-subtle">{t("loading")}</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-fg-subtle">{t("noMessages")}</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`max-w-[80%] ${m.authorClientId ? "self-end text-right" : "self-start"}`}>
                  <div
                    className={`inline-block rounded-lg px-3 py-2 text-sm ${
                      m.authorClientId ? "bg-brand-500 text-white" : "bg-gray-100 dark:bg-gray-700 text-fg"
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
              {t("send")}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
