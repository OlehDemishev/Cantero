"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { SavedViewsBar } from "@/components/saved-views-bar";
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
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [form, setForm] = useState({ name: "", address: "", clientId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState<ProjectFilters>(EMPTY_FILTERS);

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
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">{t("newProject")}</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              required
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

        <div className="lg:col-span-2">
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
          <div className="mb-4">
            <SavedViewsBar viewType="projects" currentFilters={filters} onApply={(f) => setFilters({ ...EMPTY_FILTERS, ...f })} />
          </div>

          {!projects ? (
            <p className="text-gray-500">{tc("loading")}</p>
          ) : projects.length === 0 ? (
            <p className="text-gray-500">{t("empty")}</p>
          ) : filtered.length === 0 ? (
            <p className="text-gray-500">{t("noMatches")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {filtered.map((p) => (
                <li key={p.id}>
                  <a href={`/projects/${p.id}`} className="card block hover:border-gray-400">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-sm text-gray-500">
                      {p.client?.name ?? t("noClient")} {p.address ? `· ${p.address}` : ""}
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AuthenticatedShell>
  );
}
