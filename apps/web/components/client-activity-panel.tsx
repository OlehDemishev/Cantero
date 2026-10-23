"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";

type ActivityType = "note" | "call" | "meeting" | "email";
const ACTIVITY_TYPES: ActivityType[] = ["note", "call", "meeting", "email"];

interface Activity {
  id: string;
  type: ActivityType;
  content: string;
  createdAt: string;
}
interface Client {
  notes: string | null;
}

export function ClientActivityPanel({ clientId }: { clientId: string }) {
  const t = useTranslations("clients");
  const tc = useTranslations("common");

  const { data: activities = null, reload: reloadActivities, error: activitiesError } = useApi<Activity[]>(`/clients/${clientId}/activities`);
  const [activityForm, setActivityForm] = useState({ type: "note" as ActivityType, content: "" });
  const [notesInput, setNotesInput] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function loadActivities() {
    void reloadActivities();
  }

  useEffect(() => {
    apiFetch<Client>(`/clients/${clientId}`).then((c) => setNotesInput(c.notes ?? "")).catch(notifyApiError);
  }, [clientId]);

  async function addActivity(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/clients/${clientId}/activities`, { method: "POST", body: JSON.stringify(activityForm) });
      setActivityForm({ type: "note", content: "" });
      loadActivities();
    } finally {
      setBusy(false);
    }
  }

  async function saveNotes(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotesSaved(false);
    try {
      await apiFetch(`/clients/${clientId}`, { method: "PATCH", body: JSON.stringify({ notes: notesInput }) });
      setNotesSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lg:col-span-2">
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("activity")}</h2>
      {!activities ? (
        activitiesError ? <ErrorState error={activitiesError} onRetry={reloadActivities} compact /> : <Skeleton lines={3} />
      ) : activities.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noActivity")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {activities.map((a) => (
            <li key={a.id} className="card">
              <div className="flex items-center justify-between">
                <Badge tone="neutral">
                  {t(a.type)}
                </Badge>
                <span className="text-xs text-fg-subtle">
                  {formatDateTime(new Date(a.createdAt))}
                </span>
              </div>
              <p className="mt-2 text-sm text-fg">{a.content}</p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addActivity} className="mt-4 flex flex-col gap-2">
        <div className="flex gap-2">
          <select
            className="input w-auto"
            value={activityForm.type}
            onChange={(e) => setActivityForm((f) => ({ ...f, type: e.target.value as ActivityType }))}
          >
            {ACTIVITY_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(ty)}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy || !activityForm.content} className="btn-secondary">
            {t("logActivity")}
          </button>
        </div>
        <textarea
          required
          rows={2}
          placeholder={t("activityContent")}
          className="input"
          value={activityForm.content}
          onChange={(e) => setActivityForm((f) => ({ ...f, content: e.target.value }))}
        />
      </form>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-fg-muted">{t("notes")}</h2>
      <form onSubmit={saveNotes} className="flex flex-col gap-2">
        <textarea
          rows={4}
          className="input"
          value={notesInput}
          onChange={(e) => {
            setNotesInput(e.target.value);
            setNotesSaved(false);
          }}
        />
        <div className="flex items-center gap-2">
          <button type="submit" disabled={busy} className="btn-secondary self-start">
            {tc("save")}
          </button>
          {notesSaved && <span className="text-xs text-success-fg">{tc("saved")}</span>}
        </div>
      </form>
    </div>
  );
}
