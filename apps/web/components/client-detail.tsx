"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";

type ClientStage = "lead" | "contacted" | "qualified" | "won" | "lost";
const STAGES: ClientStage[] = ["lead", "contacted", "qualified", "won", "lost"];

type ActivityType = "note" | "call" | "meeting" | "email";
const ACTIVITY_TYPES: ActivityType[] = ["note", "call", "meeting", "email"];

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: ClientStage;
  notes: string | null;
}
interface Activity {
  id: string;
  type: ActivityType;
  content: string;
  createdAt: string;
}
interface Reminder {
  id: string;
  title: string;
  dueDate: string;
  done: boolean;
}

export function ClientDetail({ clientId }: { clientId: string }) {
  const t = useTranslations("clients");
  const tc = useTranslations("common");

  const [client, setClient] = useState<Client | null>(null);
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [notesInput, setNotesInput] = useState("");
  const [activityForm, setActivityForm] = useState({ type: "note" as ActivityType, content: "" });
  const [reminderForm, setReminderForm] = useState({ title: "", dueDate: "" });
  const [busy, setBusy] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  function load() {
    apiFetch<Client>(`/clients/${clientId}`).then((c) => {
      setClient(c);
      setNotesInput(c.notes ?? "");
    });
    apiFetch<Activity[]>(`/clients/${clientId}/activities`).then(setActivities);
    apiFetch<Reminder[]>(`/clients/${clientId}/reminders`).then(setReminders);
  }

  useEffect(load, [clientId]);

  async function moveStage(stage: ClientStage) {
    setBusy(true);
    try {
      await apiFetch(`/clients/${clientId}`, { method: "PATCH", body: JSON.stringify({ stage }) });
      load();
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

  async function addActivity(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/clients/${clientId}/activities`, { method: "POST", body: JSON.stringify(activityForm) });
      setActivityForm({ type: "note", content: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function addReminder(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/clients/${clientId}/reminders`, {
        method: "POST",
        body: JSON.stringify({ title: reminderForm.title, dueDate: new Date(reminderForm.dueDate).toISOString() }),
      });
      setReminderForm({ title: "", dueDate: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function completeReminder(reminderId: string) {
    await apiFetch(`/clients/${clientId}/reminders/${reminderId}/complete`, { method: "POST" });
    load();
  }

  if (!client) {
    return (
      <AuthenticatedShell>
        <p className="text-gray-500">{tc("loading")}</p>
      </AuthenticatedShell>
    );
  }

  return (
    <AuthenticatedShell>
      <a href="/clients" className="text-sm text-gray-500 hover:underline">
        ← {t("title")}
      </a>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{client.name}</h1>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">{t(client.stage)}</span>
      </div>
      <p className="text-sm text-gray-500">{client.email ?? client.phone ?? "—"}</p>

      <div className="mt-4 flex flex-wrap gap-1">
        {STAGES.filter((s) => s !== client.stage).map((s) => (
          <button key={s} onClick={() => moveStage(s)} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
            → {t(s)}
          </button>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("activity")}</h2>
          {!activities ? (
            <p className="text-sm text-gray-400">{tc("loading")}</p>
          ) : activities.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noActivity")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {activities.map((a) => (
                <li key={a.id} className="card">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {t(a.type)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-800">{a.content}</p>
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

          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{t("notes")}</h2>
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
              {notesSaved && <span className="text-xs text-success-700">{tc("saved")}</span>}
            </div>
          </form>
        </div>

        <div className="lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("reminders")}</h2>
          {!reminders ? (
            <p className="text-sm text-gray-400">{tc("loading")}</p>
          ) : reminders.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noReminders")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {reminders.map((r) => (
                <li key={r.id} className="card flex items-center justify-between">
                  <div>
                    <div className={`text-sm font-medium ${r.done ? "text-gray-400 line-through" : "text-gray-900"}`}>
                      {r.title}
                    </div>
                    <div className="text-xs text-gray-500">{new Date(r.dueDate).toLocaleDateString()}</div>
                  </div>
                  {!r.done && (
                    <button onClick={() => completeReminder(r.id)} className="btn-secondary px-2 py-1 text-xs">
                      {t("complete")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={addReminder} className="mt-4 flex flex-col gap-2">
            <input
              required
              placeholder={t("reminderTitle")}
              className="input"
              value={reminderForm.title}
              onChange={(e) => setReminderForm((f) => ({ ...f, title: e.target.value }))}
            />
            <input
              required
              type="date"
              className="input"
              value={reminderForm.dueDate}
              onChange={(e) => setReminderForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
            <button type="submit" disabled={busy} className="btn-secondary self-start">
              {t("addReminder")}
            </button>
          </form>
        </div>
      </div>
    </AuthenticatedShell>
  );
}
