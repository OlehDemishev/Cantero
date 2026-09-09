"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { SavedViewsBar } from "@/components/saved-views-bar";
import { CsvImportButton } from "@/components/csv-import-button";
import { EmptyState } from "@/components/ui/empty-state";
import { CloseIcon, ProjectsIcon } from "@/components/nav-icons";
import { apiFetch } from "@/lib/api-client";

interface Client {
  id: string;
  name: string;
}
interface Project {
  id: string;
  name: string;
  address: string | null;
  client: Client | null;
}
interface ProjectFilters {
  search: string;
  clientId: string;
}

const EMPTY_FILTERS: ProjectFilters = { search: "", clientId: "" };

export default function ProjectsPage() {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const ti = useTranslations("import");
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [form, setForm] = useState({ name: "", address: "", clientId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState<ProjectFilters>(EMPTY_FILTERS);
  const [showCreateForm, setShowCreateForm] = useState(false);

  function load() {
    apiFetch<Project[]>("/projects").then(setProjects);
  }

  useEffect(() => {
    load();
    apiFetch<Client[]>("/clients").then(setClients);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          address: form.address || undefined,
          clientId: form.clientId || undefined,
        }),
      });
      setForm({ name: "", address: "", clientId: "" });
      setShowCreateForm(false);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = (projects ?? []).filter((p) => {
    const q = filters.search.trim().toLowerCase();
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || (p.address ?? "").toLowerCase().includes(q);
    const matchesClient = !filters.clientId || p.client?.id === filters.clientId;
    return matchesSearch && matchesClient;
  });

  return (
    <AuthenticatedShell>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <CsvImportButton endpoint="/projects/import" label={ti("importProjects")} onDone={load} />
          {!showCreateForm && (
            <button type="button" onClick={() => setShowCreateForm(true)} className="btn-primary">
              {t("newProject")}
            </button>
          )}
        </div>
      </div>

      {showCreateForm && (
        <div className="mt-6 card max-w-md">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("newProject")}</h2>
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
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              placeholder={t("address")}
              className="input"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
            <select
              className="input"
              value={form.clientId}
              onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
            >
              <option value="">{t("noClient")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="submit" disabled={submitting} className="btn-primary">
              {tc("create")}
            </button>
          </form>
        </div>
      )}

      <div className="mt-6">
        {projects && projects.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              className="input w-auto flex-1"
              placeholder={t("searchPlaceholder")}
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
            <select
              className="input w-auto"
              value={filters.clientId}
              onChange={(e) => setFilters((f) => ({ ...f, clientId: e.target.value }))}
            >
              <option value="">{t("allClients")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {projects && projects.length > 0 && (
          <div className="mb-4">
            <SavedViewsBar viewType="projects" currentFilters={filters} onApply={(f) => setFilters({ ...EMPTY_FILTERS, ...f })} />
          </div>
        )}

        {!projects ? (
          <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
        ) : projects.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={ProjectsIcon}
              title={t("emptyTitle")}
              message={t("empty")}
              cta={{ label: t("newProject"), onClick: () => setShowCreateForm(true) }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">{t("noMatches")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((p) => (
              <li key={p.id}>
                <a href={`/projects/${p.id}`} className="card block hover:border-gray-400">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {p.client?.name ?? t("noClient")} {p.address ? `· ${p.address}` : ""}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AuthenticatedShell>
  );
}
