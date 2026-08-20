"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { CsvImportButton } from "@/components/csv-import-button";
import { apiFetch } from "@/lib/api-client";

type ClientStage = "lead" | "contacted" | "qualified" | "won" | "lost";
const STAGES: ClientStage[] = ["lead", "contacted", "qualified", "won", "lost"];

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: ClientStage;
}
interface UpcomingReminder {
  id: string;
  title: string;
  dueDate: string;
  client: { id: string; name: string };
}

export default function ClientsPage() {
  const t = useTranslations("clients");
  const tc = useTranslations("common");
  const ti = useTranslations("import");
  const [clients, setClients] = useState<Client[] | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingReminder[] | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);

  function load() {
    apiFetch<Client[]>("/clients").then(setClients);
    apiFetch<UpcomingReminder[]>("/clients/reminders/upcoming").then(setUpcoming);
  }

  useEffect(load, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/clients", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          email: form.email || undefined,
          phone: form.phone || undefined,
        }),
      });
      setForm({ name: "", email: "", phone: "" });
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function moveStage(clientId: string, stage: ClientStage) {
    await apiFetch(`/clients/${clientId}`, { method: "PATCH", body: JSON.stringify({ stage }) });
    load();
  }

  return (
    <AuthenticatedShell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <CsvImportButton endpoint="/clients/import" label={ti("importClients")} onDone={load} />
      </div>

      {upcoming && upcoming.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("upcomingReminders")}</h2>
          <ul className="flex flex-col gap-2">
            {upcoming.map((r) => {
              const overdue = new Date(r.dueDate) < new Date();
              return (
                <li key={r.id} className="card flex items-center justify-between">
                  <a href={`/clients/${r.client.id}`} className="text-sm hover:underline">
                    <span className="font-medium">{r.title}</span>
                    <span className="text-gray-500"> · {r.client.name}</span>
                  </a>
                  <span className={`text-xs font-medium ${overdue ? "text-error-600" : "text-gray-500"}`}>
                    {new Date(r.dueDate).toLocaleDateString()}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-6 card max-w-md">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">{t("newClient")}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            required
            placeholder={tc("name")}
            className="input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            placeholder={tc("email")}
            type="email"
            className="input"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <input
            placeholder={tc("phone")}
            className="input"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <button type="submit" disabled={submitting} className="btn-primary">
            {tc("create")}
          </button>
        </form>
      </div>

      <div className="mt-8">
        {!clients ? (
          <p className="text-gray-500">{tc("loading")}</p>
        ) : clients.length === 0 ? (
          <p className="text-gray-500">{t("empty")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STAGES.map((stage) => (
              <div key={stage} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t(stage)}</div>
                <div className="flex flex-col gap-2">
                  {clients
                    .filter((c) => c.stage === stage)
                    .map((c) => (
                      <div key={c.id} className="card">
                        <a href={`/clients/${c.id}`} className="text-sm font-medium hover:underline">
                          {c.name}
                        </a>
                        <div className="text-xs text-gray-500">{c.email ?? c.phone ?? "—"}</div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {STAGES.filter((s) => s !== stage).map((s) => (
                            <button
                              key={s}
                              onClick={() => moveStage(c.id, s)}
                              className="btn-secondary px-2 py-0.5 text-xs"
                            >
                              → {t(s)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AuthenticatedShell>
  );
}
