"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { RFI_PRIORITIES, type RfiPriority } from "@cantero/shared";
import { submitOrQueue } from "@/lib/offline-queue";
import { fetchCached, updateCache } from "@/lib/offline-cache";
import { VoiceInputButton } from "@/components/voice-input-button";
import { CachedNote } from "@/components/field-cached-note";
import { FieldMessage, type FieldMessageType } from "@/components/field-message";

interface FieldRfi {
  id: string;
  number: string;
  subject: string;
  status: "open" | "answered" | "closed";
  priority: RfiPriority;
}

const RFI_STATUS_STYLES: Record<FieldRfi["status"], string> = {
  open: "bg-warning-50 text-warning-700",
  answered: "bg-brand-50 text-brand-700",
  closed: "bg-success-50 text-success-700",
};

export function RfiTab({ projectId }: { projectId: string }) {
  const t = useTranslations("field");
  const tr = useTranslations("rfi");
  const tc = useTranslations("common");
  const [items, setItems] = useState<FieldRfi[] | null>(null);
  const [form, setForm] = useState({ subject: "", question: "", priority: "medium" as RfiPriority });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: FieldMessageType; text: string } | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const cacheKey = `field:rfis:${projectId}`;

  function load() {
    fetchCached<FieldRfi[]>(cacheKey, `/rfis?projectId=${projectId}`)
      .then(({ data, stale, cachedAt: at }) => {
        setItems(data);
        setCachedAt(stale ? at : null);
      })
      .catch(() => setItems(null));
  }

  useEffect(load, [projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject || !form.question) return;
    setBusy(true);
    setMessage(null);
    try {
      const { queued } = await submitOrQueue("rfi", "/rfis", "POST", {
        projectId,
        subject: form.subject,
        question: form.question,
        priority: form.priority,
      });
      setMessage({ type: "success", text: queued ? t("queuedOffline") : tc("saved") });
      if (queued) {
        const optimistic: FieldRfi = { id: `queued-${Date.now()}`, number: "—", subject: form.subject, status: "open", priority: form.priority };
        const updated = [...(items ?? []), optimistic];
        setItems(updated);
        updateCache(cacheKey, updated).catch(() => {});
      }
      setForm({ subject: "", question: "", priority: "medium" });
      if (!queued) load();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : tc("error") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <CachedNote cachedAt={cachedAt} />
      <form onSubmit={submit} className="card flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700">{tr("subject")}</span>
          <input required className="input" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="flex items-center gap-2 font-medium text-gray-700">
            {tr("question")}
            <VoiceInputButton onTranscript={(text) => setForm((f) => ({ ...f, question: f.question ? `${f.question} ${text}` : text }))} />
          </span>
          <textarea required rows={3} className="input" value={form.question} onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700">{tr("priority")}</span>
          <select className="input" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as RfiPriority }))}>
            {RFI_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {tr(p)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy} className="btn-primary">
          {tr("newRfi")}
        </button>
        {message && <FieldMessage type={message.type} text={message.text} />}
      </form>

      {items === null ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400">{tr("noItems")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="card flex items-center justify-between">
              <div>
                <div className="text-xs font-mono text-gray-400">{item.number}</div>
                <div className="text-sm font-medium text-gray-900">{item.subject}</div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${RFI_STATUS_STYLES[item.status]}`}>{tr(item.status)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
