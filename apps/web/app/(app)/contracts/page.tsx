"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format-date";
import { useConfirm } from "@/components/ui/confirm-dialog";

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
  signed: "bg-success-50 dark:bg-success-500/15 text-success-fg",
  void: "bg-error-50 dark:bg-error-500/15 text-danger-fg",
};

export default function ContractsPage() {
  const t = useTranslations("contracts");
  const confirm = useConfirm();
  const tc = useTranslations("common");

  const { data: contracts = null, reload: reloadContracts, error: contractsError } = useApi<Contract[]>("/contracts");
  const { data: templates = null, reload: reloadTemplates } = useApi<ContractTemplate[]>("/contract-templates");
  const [templateForm, setTemplateForm] = useState({ name: "", body: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadContracts();
    void reloadTemplates();
  }

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
    if (!(await confirm({ message: t("confirmDeleteTemplate"), tone: "danger", verb: "delete" }))) return;
    await apiFetch(`/contract-templates/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-fg-subtle">{t("subtitle")}</p>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("allContracts")}</h2>
          {!contracts ? (
            contractsError ? <ErrorState error={contractsError} onRetry={reloadContracts} compact /> : <Skeleton lines={3} />
          ) : contracts.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t("noContracts")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {contracts.map((c) => (
                <li key={c.id}>
                  <a href={`/contracts/${c.id}`} className="card flex items-center justify-between hover:border-gray-400">
                    <div>
                      <div className="font-medium text-fg">{c.title}</div>
                      <div className="mt-0.5 text-xs text-fg-subtle">
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
          <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("templates")}</h2>
          <div className="card">
            {!templates || templates.length === 0 ? (
              <p className="text-sm text-fg-subtle">{t("noTemplates")}</p>
            ) : (
              <ul className="mb-4 flex flex-col gap-1.5">
                {templates.map((tpl) => (
                  <li key={tpl.id} className="flex items-center justify-between text-sm">
                    <span className="text-fg-muted">{tpl.name}</span>
                    <button onClick={() => deleteTemplate(tpl.id)} className="text-fg-subtle hover:text-danger-fg">
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
    </>
  );
}
