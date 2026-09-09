"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface ContractTemplate {
  id: string;
  name: string;
  body: string;
}
interface Contract {
  id: string;
  title: string;
  status: "draft" | "sent" | "signed" | "void";
  client: { id: string; name: string } | null;
  subcontractor: { id: string; name: string } | null;
  createdAt: string;
}

const STATUS_STYLES: Record<Contract["status"], string> = {
  draft: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
  sent: "bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-400",
  signed: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
  void: "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500",
};

export default function ContractsPage() {
  const t = useTranslations("contracts");
  const tc = useTranslations("common");

  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [templates, setTemplates] = useState<ContractTemplate[] | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: "", body: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Contract[]>("/contracts").then(setContracts);
    apiFetch<ContractTemplate[]>("/contract-templates").then(setTemplates);
  }

  useEffect(load, []);

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/contract-templates", { method: "POST", body: JSON.stringify(templateForm) });
      setTemplateForm({ name: "", body: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!window.confirm(t("confirmDeleteTemplate"))) return;
    await apiFetch(`/contract-templates/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("subtitle")}</p>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("allContracts")}</h2>
          {!contracts ? (
            <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
          ) : contracts.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("noContracts")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {contracts.map((c) => (
                <li key={c.id}>
                  <a href={`/contracts/${c.id}`} className="card flex items-center justify-between hover:border-gray-400">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white/90">{c.title}</div>
                      <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {c.client?.name ?? c.subcontractor?.name ?? "—"} · {formatDate(new Date(c.createdAt))}
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[c.status]}`}>{t(c.status)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("templates")}</h2>
          <div className="card">
            {!templates || templates.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">{t("noTemplates")}</p>
            ) : (
              <ul className="mb-4 flex flex-col gap-1.5">
                {templates.map((tpl) => (
                  <li key={tpl.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300">{tpl.name}</span>
                    <button onClick={() => deleteTemplate(tpl.id)} className="text-gray-400 dark:text-gray-500 hover:text-error-600">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={createTemplate} className="flex flex-col gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
              <input
                required
                placeholder={t("templateNamePlaceholder")}
                className="input"
                value={templateForm.name}
                onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
              />
              <textarea
                required
                rows={5}
                placeholder={t("templateBodyPlaceholder")}
                className="input"
                value={templateForm.body}
                onChange={(e) => setTemplateForm((f) => ({ ...f, body: e.target.value }))}
              />
              <button type="submit" disabled={busy} className="btn-secondary self-start">
                {tc("create")}
              </button>
            </form>
          </div>
        </div>
      </div>
    </AuthenticatedShell>
  );
}
