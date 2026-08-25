"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { CsvImportButton } from "@/components/csv-import-button";
import { SavedViewsBar } from "@/components/saved-views-bar";
import { CrmPipelinePanel } from "@/components/crm-pipeline-panel";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

type ClientStage = "lead" | "contacted" | "qualified" | "won" | "lost";
const STAGES: ClientStage[] = ["lead", "contacted", "qualified", "won", "lost"];

interface Worker {
  id: string;
  name: string;
}
interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: ClientStage;
  estimatedValue: number | null;
  owner: Worker | null;
}
interface UpcomingReminder {
  id: string;
  title: string;
  dueDate: string;
  client: { id: string; name: string };
}
interface PipelineSummaryRow {
  stage: ClientStage;
  count: number;
  totalValue: number;
}
interface ClientFilters {
  search: string;
  ownerWorkerId: string;
}

const EMPTY_FILTERS: ClientFilters = { search: "", ownerWorkerId: "" };

export default function ClientsPage() {
  const t = useTranslations("clients");
  const tc = useTranslations("common");
  const ti = useTranslations("import");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [clients, setClients] = useState<Client[] | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingReminder[] | null>(null);
  const [summary, setSummary] = useState<PipelineSummaryRow[] | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", estimatedValue: "", ownerWorkerId: "" });
  const [submitting, setSubmitting] = useState(false);

  const [pendingLostId, setPendingLostId] = useState<string | null>(null);
  const [lostReasonDraft, setLostReasonDraft] = useState("");
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convertForm, setConvertForm] = useState({ name: "", address: "" });
  const [filters, setFilters] = useState<ClientFilters>(EMPTY_FILTERS);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<ClientStage | null>(null);

  function load() {
    apiFetch<Client[]>("/clients").then(setClients);
    apiFetch<UpcomingReminder[]>("/clients/reminders/upcoming").then(setUpcoming);
    apiFetch<PipelineSummaryRow[]>("/clients/pipeline-summary").then(setSummary);
  }

  useEffect(() => {
    load();
    apiFetch<Worker[]>("/workers").then(setWorkers);
  }, []);

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
          estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : undefined,
          ownerWorkerId: form.ownerWorkerId || undefined,
        }),
      });
      setForm({ name: "", email: "", phone: "", estimatedValue: "", ownerWorkerId: "" });
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function moveStage(clientId: string, stage: ClientStage) {
    if (stage === "lost") {
      setPendingLostId(clientId);
      setLostReasonDraft("");
      return;
    }
    await apiFetch(`/clients/${clientId}/move-stage`, { method: "POST", body: JSON.stringify({ stage }) });
    load();
  }

  async function confirmLost(clientId: string) {
    if (!lostReasonDraft.trim()) return;
    await apiFetch(`/clients/${clientId}/move-stage`, {
      method: "POST",
      body: JSON.stringify({ stage: "lost", lostReason: lostReasonDraft }),
    });
    setPendingLostId(null);
    load();
  }

  function startConvert(client: Client) {
    setConvertingId(client.id);
    setConvertForm({ name: client.name, address: "" });
  }

  async function submitConvert(e: React.FormEvent, clientId: string) {
    e.preventDefault();
    const project = await apiFetch<{ id: string }>(`/clients/${clientId}/convert-to-project`, {
      method: "POST",
      body: JSON.stringify({ name: convertForm.name, address: convertForm.address || undefined }),
    });
    window.location.href = `/projects/${project.id}`;
  }

  const filteredClients = (clients ?? []).filter((c) => {
    const q = filters.search.trim().toLowerCase();
    const matchesSearch = !q || c.name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q);
    const matchesOwner = !filters.ownerWorkerId || c.owner?.id === filters.ownerWorkerId;
    return matchesSearch && matchesOwner;
  });

  return (
    <AuthenticatedShell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <CsvImportButton endpoint="/clients/import" label={ti("importClients")} onDone={load} />
      </div>

      {summary && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("pipelineOverview")}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {summary.map((s) => (
              <div key={s.stage} className="card">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{t(s.stage)}</div>
                <div className="mt-1 text-xl font-semibold text-gray-900">{s.count}</div>
                <div className="mt-0.5 text-xs text-gray-400">
                  {s.totalValue} {currency}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
          <input
            type="number"
            min="0"
            placeholder={t("estimatedValue")}
            className="input"
            value={form.estimatedValue}
            onChange={(e) => setForm((f) => ({ ...f, estimatedValue: e.target.value }))}
          />
          <select
            className="input"
            value={form.ownerWorkerId}
            onChange={(e) => setForm((f) => ({ ...f, ownerWorkerId: e.target.value }))}
          >
            <option value="">{t("owner")}</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={submitting} className="btn-primary">
            {tc("create")}
          </button>
        </form>
      </div>

      <div className="mt-8">
        {clients && clients.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              className="input w-auto flex-1"
              placeholder={t("searchPlaceholder")}
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
            <select
              className="input w-auto"
              value={filters.ownerWorkerId}
              onChange={(e) => setFilters((f) => ({ ...f, ownerWorkerId: e.target.value }))}
            >
              <option value="">{t("allOwners")}</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <SavedViewsBar viewType="clients" currentFilters={filters} onApply={(f) => setFilters({ ...EMPTY_FILTERS, ...f })} />
          </div>
        )}

        {!clients ? (
          <p className="text-gray-500">{tc("loading")}</p>
        ) : clients.length === 0 ? (
          <p className="text-gray-500">{t("empty")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STAGES.map((stage) => (
              <div
                key={stage}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverStage(stage);
                }}
                onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverStage(null);
                  if (draggedId) moveStage(draggedId, stage);
                }}
                className={`rounded-lg border p-3 transition-colors ${
                  dragOverStage === stage ? "border-brand-400 bg-brand-50" : "border-gray-200 bg-gray-50"
                }`}
              >
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t(stage)}</div>
                <div className="flex flex-col gap-2">
                  {filteredClients
                    .filter((c) => c.stage === stage)
                    .map((c) => (
                      <div
                        key={c.id}
                        draggable
                        onDragStart={() => setDraggedId(c.id)}
                        onDragEnd={() => setDraggedId(null)}
                        className={`card cursor-grab active:cursor-grabbing ${draggedId === c.id ? "opacity-50" : ""}`}
                      >
                        <a href={`/clients/${c.id}`} className="text-sm font-medium hover:underline">
                          {c.name}
                        </a>
                        <div className="text-xs text-gray-500">{c.email ?? c.phone ?? "—"}</div>
                        {c.estimatedValue != null && (
                          <div className="mt-1 text-xs font-medium text-gray-700">
                            {c.estimatedValue} {currency}
                          </div>
                        )}
                        {c.owner && <div className="text-xs text-gray-400">{t("ownedBy", { name: c.owner.name })}</div>}

                        {pendingLostId === c.id ? (
                          <div className="mt-2 flex flex-col gap-1.5">
                            <textarea
                              rows={2}
                              className="input text-xs"
                              placeholder={t("lostReasonPlaceholder")}
                              value={lostReasonDraft}
                              onChange={(e) => setLostReasonDraft(e.target.value)}
                            />
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => confirmLost(c.id)}
                                disabled={!lostReasonDraft.trim()}
                                className="btn-secondary px-2 py-0.5 text-xs"
                              >
                                {t("confirmLoss")}
                              </button>
                              <button onClick={() => setPendingLostId(null)} className="btn-secondary px-2 py-0.5 text-xs">
                                {tc("cancel")}
                              </button>
                            </div>
                          </div>
                        ) : convertingId === c.id ? (
                          <form onSubmit={(e) => submitConvert(e, c.id)} className="mt-2 flex flex-col gap-1.5">
                            <input
                              required
                              className="input text-xs"
                              placeholder={t("projectName")}
                              value={convertForm.name}
                              onChange={(e) => setConvertForm((f) => ({ ...f, name: e.target.value }))}
                            />
                            <div className="flex gap-1.5">
                              <button type="submit" className="btn-primary px-2 py-0.5 text-xs">
                                {t("convertToProject")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConvertingId(null)}
                                className="btn-secondary px-2 py-0.5 text-xs"
                              >
                                {tc("cancel")}
                              </button>
                            </div>
                          </form>
                        ) : (
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
                            {stage === "won" && (
                              <button onClick={() => startConvert(c)} className="btn-primary px-2 py-0.5 text-xs">
                                {t("convertToProject")}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CrmPipelinePanel />
    </AuthenticatedShell>
  );
}
