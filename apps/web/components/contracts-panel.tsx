"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/status-tone";

interface ContractTemplate {
  id: string;
  name: string;
}
interface Contract {
  id: string;
  title: string;
  status: "draft" | "sent" | "signed" | "void";
  client: { id: string; name: string } | null;
}

export function ContractsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("contracts");
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");

  const { data: contracts = null, reload: reloadContracts } = useApi<Contract[]>(`/contracts?projectId=${projectId}`);
  const { data: templates = [] } = useApi<ContractTemplate[]>("/contract-templates");
  const [form, setForm] = useState({ title: "", templateId: "", body: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadContracts();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/contracts", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          title: form.title,
          templateId: form.templateId || undefined,
          body: form.templateId ? undefined : form.body,
        }),
      });
      setForm({ title: "", templateId: "", body: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <div className="card">
        {!contracts || contracts.length === 0 ? (
          <p className="text-sm text-fg-subtle">{t("noContracts")}</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-1.5">
            {contracts.map((c) => (
              <li key={c.id}>
                <a href={`/contracts/${c.id}`} className="flex items-center justify-between rounded-lg px-1 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-white/5">
                  <span className="text-fg-muted">{c.title}</span>
                  <Badge tone={statusTone(c.status)}>{t(c.status)}</Badge>
                </a>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={create} className="flex flex-col gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
          <div className="flex flex-wrap items-end gap-2">
            <input
              required
              placeholder={t("titlePlaceholder")} aria-label={t("titlePlaceholder")}
              className="input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            <select aria-label={ta("template")} className="input w-auto" value={form.templateId} onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}>
              <option value="">{t("customBody")}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
            <button type="submit" disabled={busy} className="btn-secondary">
              {tc("create")}
            </button>
          </div>
          {!form.templateId && (
            <textarea
              required
              rows={3}
              placeholder={t("bodyPlaceholder")} aria-label={t("bodyPlaceholder")}
              className="input"
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            />
          )}
        </form>
      </div>
    </div>
  );
}
