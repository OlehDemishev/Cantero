"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface InspectionTemplateItem {
  id: string;
  description: string;
}
interface InspectionTemplate {
  id: string;
  name: string;
  trade: string;
  items: InspectionTemplateItem[];
}

export function InspectionTemplatesPanel() {
  const t = useTranslations("quality");
  const confirm = useConfirm();
  const td = useTranslations("dialog");
  const tc = useTranslations("common");

  const { data: templates = null, reload: reloadTemplates, error: templatesError } = useApi<InspectionTemplate[]>("/inspection-templates");
  const [form, setForm] = useState({ name: "", trade: "" });
  const [items, setItems] = useState<string[]>([""]);
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadTemplates();
  }

  function updateItem(index: number, value: string) {
    setItems((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  function addItemField() {
    setItems((prev) => [...prev, ""]);
  }

  function removeItemField(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const descriptions = items.map((i) => i.trim()).filter(Boolean);
    if (descriptions.length === 0) return;
    setBusy(true);
    try {
      await apiFetch("/inspection-templates", {
        method: "POST",
        body: JSON.stringify({ name: form.name, trade: form.trade, items: descriptions.map((description) => ({ description })) }),
      });
      setForm({ name: "", trade: "" });
      setItems([""]);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!(await confirm({ message: td("deleteInspectionTemplate"), tone: "danger", verb: "delete" }))) return;
    setBusy(true);
    try {
      await apiFetch(`/inspection-templates/${id}`, { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("inspectionTemplates")}</h2>
      <p className="mb-4 text-sm text-fg-subtle">{t("inspectionTemplatesHint")}</p>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              required
              placeholder={tc("name")}
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              required
              placeholder={t("trade")}
              className="input"
              value={form.trade}
              onChange={(e) => setForm((f) => ({ ...f, trade: e.target.value }))}
            />
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("checklistItems")}</p>
            {items.map((value, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="input flex-1"
                  placeholder={t("checklistItemPlaceholder")}
                  value={value}
                  onChange={(e) => updateItem(i, e.target.value)}
                />
                <button type="button" onClick={() => removeItemField(i)} className="text-xs text-danger-fg">
                  {tc("delete")}
                </button>
              </div>
            ))}
            <button type="button" onClick={addItemField} className="btn-secondary self-start px-3 py-1 text-xs">
              {t("addChecklistItem")}
            </button>
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("create")}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2">
          {templates === null ? (
            templatesError ? <ErrorState error={templatesError} onRetry={reloadTemplates} compact /> : <Skeleton lines={3} />
          ) : templates.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t("noInspectionTemplates")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {templates.map((tpl) => (
                <li key={tpl.id} className="card">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{tpl.name}</span>
                      <span className="ml-2 text-xs text-fg-subtle">{tpl.trade}</span>
                    </div>
                    <button onClick={() => remove(tpl.id)} disabled={busy} className="text-xs text-danger-fg hover:underline">
                      {tc("delete")}
                    </button>
                  </div>
                  <ul className="mt-2 flex flex-col gap-0.5 text-xs text-fg-subtle">
                    {tpl.items.map((item) => (
                      <li key={item.id}>{item.description}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
