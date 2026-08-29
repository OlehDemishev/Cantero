"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getPortalToken, portalApiFetch } from "@/lib/portal-api-client";
import { ApiError } from "@/lib/api-client";

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
  const router = useRouter();

  const [messages, setMessages] = useState<PortalMessage[] | null>(null);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  function load() {
    portalApiFetch<PortalMessage[]>(`/portal/projects/${id}/messages`)
      .then((list) => {
        setMessages(list);
        setTimeout(() => bottomRef.current?.scrollIntoView({ block: "end" }), 0);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("verifyError")));
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

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
        <p className="text-sm text-gray-500">{error}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen justify-center bg-gray-50 px-6 py-12">
      <div className="flex w-full max-w-2xl flex-col">
        <a href="/portal" className="mb-4 inline-block text-xs text-gray-500 hover:underline">
          ← {t("back")}
        </a>
        <div className="card flex flex-1 flex-col">
          <h1 className="mb-3 text-lg font-semibold text-gray-900">{t("messages")}</h1>

          <div className="flex max-h-[60vh] min-h-[200px] flex-col gap-3 overflow-y-auto">
            {!messages ? (
              <p className="text-sm text-gray-400">{t("loading")}</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-gray-400">{t("noMessages")}</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`max-w-[80%] ${m.authorClientId ? "self-end text-right" : "self-start"}`}>
                  <div
                    className={`inline-block rounded-lg px-3 py-2 text-sm ${
                      m.authorClientId ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {m.content}
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400">
                    {m.authorName} · {new Date(m.createdAt).toLocaleString()}
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={send} className="mt-4 flex items-end gap-2 border-t border-gray-100 pt-4">
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
