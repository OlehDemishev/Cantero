"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface Reminder {
  id: string;
  title: string;
  dueDate: string;
  done: boolean;
}

export function ClientRemindersPanel({ clientId }: { clientId: string }) {
  const t = useTranslations("clients");
  const tc = useTranslations("common");

  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [reminderForm, setReminderForm] = useState({ title: "", dueDate: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Reminder[]>(`/clients/${clientId}/reminders`).then(setReminders);
  }

  useEffect(load, [clientId]);

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

  return (
    <div className="lg:col-span-1">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("reminders")}</h2>
      {!reminders ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : reminders.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noReminders")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {reminders.map((r) => (
            <li key={r.id} className="card flex items-center justify-between">
              <div>
                <div className={`text-sm font-medium ${r.done ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-900 dark:text-gray-50"}`}>
                  {r.title}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{formatDate(new Date(r.dueDate))}</div>
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
  );
}
