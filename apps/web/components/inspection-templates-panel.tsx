"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

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
  const tc = useTranslations("common");

  const [templates, setTemplates] = useState<InspectionTemplate[] | null>(null);
  const [form, setForm] = useState({ name: "", trade: "" });
  const [items, setItems] = useState<string[]>([""]);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<InspectionTemplate[]>("/inspection-templates").then(setTemplates);
  }

  useEffect(load, []);

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
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("inspectionTemplates")}</h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t("inspectionTemplatesHint")}</p>

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
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("checklistItems")}</p>
            {items.map((value, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="input flex-1"
                  placeholder={t("checklistItemPlaceholder")}
                  value={value}
                  onChange={(e) => updateItem(i, e.target.value)}
                />
                <button type="button" onClick={() => removeItemField(i)} className="text-xs text-error-700 dark:text-error-500">
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
            <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">—</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {templates.map((tpl) => (
                <li key={tpl.id} className="card">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{tpl.name}</span>
                      <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{tpl.trade}</span>
                    </div>
                    <button onClick={() => remove(tpl.id)} disabled={busy} className="text-xs text-error-700 dark:text-error-500 hover:underline">
                      {tc("delete")}
                    </button>
                  </div>
                  <ul className="mt-2 flex flex-col gap-0.5 text-xs text-gray-500 dark:text-gray-400">
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
