"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { submitOrQueue } from "@/lib/offline-queue";
import { fetchCached, updateCache } from "@/lib/offline-cache";
import { CachedNote } from "@/components/field-cached-note";
import { FieldMessage, type FieldMessageType } from "@/components/field-message";

interface PunchListItem {
  id: string;
  title: string;
  location: string | null;
  status: "open" | "resolved" | "verified";
}

export function PunchTab({ projectId }: { projectId: string }) {
  const t = useTranslations("field");
  const tp = useTranslations("punchList");
  const tc = useTranslations("common");
  const [items, setItems] = useState<PunchListItem[] | null>(null);
  const [form, setForm] = useState({ title: "", location: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: FieldMessageType; text: string } | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const cacheKey = `field:punch-list:${projectId}`;

  function load() {
    fetchCached<PunchListItem[]>(cacheKey, `/punch-list?projectId=${projectId}`)
      .then(({ data, stale, cachedAt: at }) => {
        setItems(data);
        setCachedAt(stale ? at : null);
      })
      .catch(() => setItems(null));
  }

  useEffect(load, [projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title) return;
    setBusy(true);
    setMessage(null);
    try {
      const { queued } = await submitOrQueue("punch-list-item", "/punch-list", "POST", {
        projectId,
        title: form.title,
        location: form.location || undefined,
      });
      setMessage({ type: "success", text: queued ? t("queuedOffline") : tc("saved") });
      if (queued) {
        const optimistic: PunchListItem = { id: `queued-${Date.now()}`, title: form.title, location: form.location || null, status: "open" };
        const updated = [...(items ?? []), optimistic];
        setItems(updated);
        updateCache(cacheKey, updated).catch(() => {});
      }
      setForm({ title: "", location: "" });
      if (!queued) load();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : tc("error") });
    } finally {
      setBusy(false);
    }
  }

  async function resolve(id: string) {
    const previous = items ?? [];
    try {
      const { queued } = await submitOrQueue("punch-list-resolve", `/punch-list/${id}/resolve`, "POST", {});
      if (queued) {
        const updated = previous.map((i) => (i.id === id ? { ...i, status: "resolved" as const } : i));
        setItems(updated);
        updateCache(cacheKey, updated).catch(() => {});
      } else {
        load();
      }
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : tc("error") });
    }
  }

  const openAndResolved = (items ?? []).filter((i) => i.status !== "verified");

  return (
    <div className="flex flex-col gap-4">
      <CachedNote cachedAt={cachedAt} />
      <form onSubmit={submit} className="card flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700">{tp("itemTitle")}</span>
          <input
            required
            className="input"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700">{tp("location")}</span>
          <input
            className="input"
            placeholder={tp("locationPlaceholder")}
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
        </label>
        <button type="submit" disabled={busy} className="btn-primary">
          {tp("newItem")}
        </button>
        {message && <FieldMessage type={message.type} text={message.text} />}
      </form>

      {items === null ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : openAndResolved.length === 0 ? (
        <p className="text-sm text-gray-400">{tp("noItems")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {openAndResolved.map((item) => (
            <li key={item.id} className="card flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900">{item.title}</div>
                {item.location && <div className="text-xs text-gray-500">{item.location}</div>}
              </div>
              {item.status === "open" ? (
                <button onClick={() => resolve(item.id)} className="btn-secondary px-2.5 py-1 text-xs">
                  {tp("markResolved")}
                </button>
              ) : (
                <span className="rounded-full bg-warning-50 px-2.5 py-1 text-xs font-medium text-warning-700">
                  {tp("resolved")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
