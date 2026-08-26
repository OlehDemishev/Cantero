"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

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

const STATUS_STYLES: Record<Contract["status"], string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-amber-100 text-amber-800",
  signed: "bg-success-50 text-success-700",
  void: "bg-error-50 text-error-700",
};

export function ContractsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("contracts");
  const tc = useTranslations("common");

  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [form, setForm] = useState({ title: "", templateId: "", body: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Contract[]>(`/contracts?projectId=${projectId}`).then(setContracts);
  }

  useEffect(load, [projectId]);
  useEffect(() => {
    apiFetch<ContractTemplate[]>("/contract-templates").then(setTemplates);
  }, []);

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
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <div className="card">
        {!contracts || contracts.length === 0 ? (
          <p className="text-sm text-gray-400">{t("noContracts")}</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-1.5">
            {contracts.map((c) => (
              <li key={c.id}>
                <a href={`/contracts/${c.id}`} className="flex items-center justify-between rounded-lg px-1 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-white/5">
                  <span className="text-gray-700 dark:text-gray-300">{c.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status]}`}>{t(c.status)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={create} className="flex flex-col gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
          <div className="flex flex-wrap items-end gap-2">
            <input
              required
              placeholder={t("titlePlaceholder")}
              className="input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            <select className="input w-auto" value={form.templateId} onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}>
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
              placeholder={t("bodyPlaceholder")}
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
