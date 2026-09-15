"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { CloseIcon, ServiceContractsIcon } from "@/components/nav-icons";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface Project {
  id: string;
  name: string;
}
interface Client {
  id: string;
  name: string;
}
interface ServiceContract {
  id: string;
  title: string;
  frequencyMonths: number;
  nextVisitDate: string;
  active: boolean;
  project: Project;
  client: Client;
}

export default function ServiceContractsPage() {
  const t = useTranslations("serviceContracts");
  const tc = useTranslations("common");

  const [contracts, setContracts] = useState<ServiceContract[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [form, setForm] = useState({ projectId: "", clientId: "", title: "", frequencyMonths: "3", startDate: "" });
  const [submitting, setSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  function load() {
    apiFetch<ServiceContract[]>("/service-contracts").then(setContracts);
  }

  useEffect(() => {
    load();
    apiFetch<Project[]>("/projects").then(setProjects);
    apiFetch<Client[]>("/clients").then(setClients);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/service-contracts", {
        method: "POST",
        body: JSON.stringify({
          projectId: form.projectId,
          clientId: form.clientId,
          title: form.title,
          frequencyMonths: Number(form.frequencyMonths),
          startDate: new Date(form.startDate).toISOString(),
        }),
      });
      setForm({ projectId: "", clientId: "", title: "", frequencyMonths: "3", startDate: "" });
      setShowCreateForm(false);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthenticatedShell>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {!showCreateForm && (
          <button type="button" onClick={() => setShowCreateForm(true)} className="btn-primary">
            {t("newContract")}
          </button>
        )}
      </div>

      {showCreateForm && (
        <div className="mt-6 card max-w-md">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("newContract")}</h2>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              aria-label={tc("cancel")}
              className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              required
              autoFocus
              placeholder={tc("name")}
              className="input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            <select
              required
              className="input"
              value={form.projectId}
              onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
            >
              <option value="">{t("selectProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              required
              className="input"
              value={form.clientId}
              onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
            >
              <option value="">{t("selectClient")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("frequencyMonths")}
              <input
                required
                type="number"
                min="1"
                className="input mt-1"
                value={form.frequencyMonths}
                onChange={(e) => setForm((f) => ({ ...f, frequencyMonths: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("startDate")}
              <input
                required
                type="date"
                className="input mt-1"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </label>
            <button type="submit" disabled={submitting} className="btn-primary">
              {tc("create")}
            </button>
          </form>
        </div>
      )}

      <div className="mt-6">
        {!contracts ? (
          <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
        ) : contracts.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={ServiceContractsIcon}
              title={t("emptyTitle")}
              message={t("empty")}
              cta={{ label: t("newContract"), onClick: () => setShowCreateForm(true) }}
            />
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
              {contracts.map((c) => (
                <li key={c.id} className="card flex items-center justify-between hover:border-gray-400">
                  <div>
                    <a href={`/service-contracts/${c.id}`} className="font-medium hover:underline">
                      {c.title}
                    </a>
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                      <Link href={`/projects/${c.project.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                        {c.project.name}
                      </Link>{" "}
                      ·{" "}
                      <Link href={`/clients/${c.client.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                        {c.client.name}
                      </Link>
                    </span>
                  </div>
                  <a href={`/service-contracts/${c.id}`} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
                    {t("nextVisit")}: {formatDate(new Date(c.nextVisitDate))}
                  </a>
                </li>
              ))}
            </ul>
          )}
      </div>
    </AuthenticatedShell>
  );
}
