"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format-date";

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

  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [activityForm, setActivityForm] = useState({ type: "note" as ActivityType, content: "" });
  const [notesInput, setNotesInput] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function loadActivities() {
    apiFetch<Activity[]>(`/clients/${clientId}/activities`).then(setActivities);
  }

  useEffect(() => {
    loadActivities();
    apiFetch<Client>(`/clients/${clientId}`).then((c) => setNotesInput(c.notes ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("activity")}</h2>
      {!activities ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : activities.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noActivity")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {activities.map((a) => (
            <li key={a.id} className="card">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                  {t(a.type)}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {formatDateTime(new Date(a.createdAt))}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-800 dark:text-gray-100">{a.content}</p>
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

      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("notes")}</h2>
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
          {notesSaved && <span className="text-xs text-success-700 dark:text-success-500">{tc("saved")}</span>}
        </div>
      </form>
    </div>
  );
}
