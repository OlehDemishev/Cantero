"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SavedViewsBar } from "@/components/saved-views-bar";
import { CsvImportButton } from "@/components/csv-import-button";
import { EmptyState } from "@/components/ui/empty-state";
import { CloseIcon, ProjectsIcon } from "@/components/nav-icons";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { useCan } from "@/lib/permissions";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { createProjectSchema } from "@cantero/shared";
import { Field, FormError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { optionalText, useFormValidation } from "@/lib/form-validation";

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
  const { data: projects = null, reload: reloadProjects, error: projectsError } = useApi<Project[]>("/projects");
  // Clients to link a new project to — only listed for members who may see clients.
  const seesClients = useCan()("clients.view");
  const { data: clients = [] } = useApi<Client[]>(seesClients ? "/clients" : null);
  const [form, setForm] = useState({ name: "", address: "", clientId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { errors, validate, clearError, formRef } = useFormValidation(createProjectSchema);
  const [filters, setFilters] = useState<ProjectFilters>(EMPTY_FILTERS);
  const [showCreateForm, setShowCreateForm] = useState(false);

  function load() {
    void reloadProjects();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = validate({ name: form.name.trim(), address: optionalText(form.address), clientId: form.clientId || undefined });
    if (!body) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiFetch("/projects", { method: "POST", body: JSON.stringify(body) });
      setForm({ name: "", address: "", clientId: "" });
      setShowCreateForm(false);
      load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : tc("error"));
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
    <>
      <PageHeader
        title={t("title")}
        actions={
          <>
            <CsvImportButton endpoint="/projects/import" label={ti("importProjects")} onDone={load} />
            {!showCreateForm && (
              <button type="button" onClick={() => setShowCreateForm(true)} className="btn-primary">
                {t("newProject")}
              </button>
            )}
          </>
        }
      />

      {showCreateForm && (
        <div className="mt-6 card max-w-md">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg-muted">{t("newProject")}</h2>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              aria-label={tc("cancel")}
              className="text-fg-subtle hover:text-gray-600 dark:hover:text-gray-300"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
          <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
            <Field label={tc("name")} error={errors.name}>
              <input
                required
                autoFocus
                className="input"
                value={form.name}
                onChange={(e) => {
                  setForm((f) => ({ ...f, name: e.target.value }));
                  clearError("name");
                }}
              />
            </Field>
            <Field label={t("address")} error={errors.address}>
              <input
                className="input"
                value={form.address}
                onChange={(e) => {
                  setForm((f) => ({ ...f, address: e.target.value }));
                  clearError("address");
                }}
              />
            </Field>
            {seesClients && (
              <Field label={t("client")} error={errors.clientId}>
                <select className="input" value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}>
                  <option value="">{t("noClient")}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <FormError>{submitError}</FormError>
            <Button type="submit" loading={submitting}>
              {tc("create")}
            </Button>
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
          projectsError ? <ErrorState error={projectsError} onRetry={reloadProjects} compact /> : <Skeleton lines={3} />
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
          <p className="text-fg-subtle">{t("noMatches")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((p) => (
              <li key={p.id}>
                <a href={`/projects/${p.id}`} className="card block hover:border-gray-400">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-sm text-fg-subtle">
                    {p.client?.name ?? t("noClient")} {p.address ? `· ${p.address}` : ""}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
