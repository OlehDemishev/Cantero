"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ChecklistTemplateType } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";

const TYPES: ChecklistTemplateType[] = ["punch_list", "rfi", "safety_briefing"];

interface TemplateItem {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
}
interface Template {
  id: string;
  type: ChecklistTemplateType;
  name: string;
  defaultSubject: string | null;
  defaultBody: string | null;
  items: TemplateItem[];
}
interface ItemDraft {
  title: string;
  description: string;
  location: string;
}

const EMPTY_ITEM: ItemDraft = { title: "", description: "", location: "" };

export default function TemplatesPage() {
  const t = useTranslations("checklistTemplates");
  const tc = useTranslations("common");

  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [type, setType] = useState<ChecklistTemplateType>("punch_list");
  const [name, setName] = useState("");
  const [defaultSubject, setDefaultSubject] = useState("");
  const [defaultBody, setDefaultBody] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([{ ...EMPTY_ITEM }]);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Template[]>("/checklist-templates").then(setTemplates);
  }

  useEffect(load, []);

  function resetForm() {
    setName("");
    setDefaultSubject("");
    setDefaultBody("");
    setItems([{ ...EMPTY_ITEM }]);
  }

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/checklist-templates", {
        method: "POST",
        body: JSON.stringify({
          type,
          name,
          items: type === "punch_list" ? items.filter((it) => it.title.trim()).map((it) => ({
            title: it.title,
            description: it.description || undefined,
            location: it.location || undefined,
          })) : undefined,
          defaultSubject: type !== "punch_list" ? defaultSubject : undefined,
          defaultBody: type !== "punch_list" ? defaultBody || undefined : undefined,
        }),
      });
      resetForm();
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await apiFetch(`/checklist-templates/${id}`, { method: "DELETE" });
    load();
  }

  const grouped = TYPES.map((ty) => ({ type: ty, list: (templates ?? []).filter((tpl) => tpl.type === ty) }));

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>

      <div className="mt-6 card max-w-xl">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">{t("newTemplate")}</h2>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("templateType")}</span>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as ChecklistTemplateType)}>
              {TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {t(ty)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("templateName")}</span>
            <input required className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          {type === "punch_list" ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-700">{t("checklistItems")}</span>
              {items.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="input"
                    placeholder={t("itemTitlePlaceholder")}
                    value={item.title}
                    onChange={(e) => updateItem(i, { title: e.target.value })}
                  />
                  <input
                    className="input"
                    placeholder={t("itemLocationPlaceholder")}
                    value={item.location}
                    onChange={(e) => updateItem(i, { location: e.target.value })}
                  />
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} className="text-gray-400 hover:text-error-600">
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addItem} className="btn-secondary self-start px-2.5 py-1 text-xs">
                {t("addItem")}
              </button>
            </div>
          ) : (
            <>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700">{type === "rfi" ? t("subject") : t("topic")}</span>
                <input required className="input" value={defaultSubject} onChange={(e) => setDefaultSubject(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700">{type === "rfi" ? t("question") : t("notes")}</span>
                <textarea rows={3} className="input" value={defaultBody} onChange={(e) => setDefaultBody(e.target.value)} />
              </label>
            </>
          )}

          <button type="submit" disabled={busy} className="btn-primary self-start">
            {tc("create")}
          </button>
        </form>
      </div>

      {!templates ? (
        <p className="mt-8 text-gray-500">{tc("loading")}</p>
      ) : (
        grouped.map(({ type: ty, list }) => (
          <div key={ty} className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">{t(ty)}</h2>
            {list.length === 0 ? (
              <p className="text-sm text-gray-400">{t("noTemplates")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {list.map((tpl) => (
                  <li key={tpl.id} className="card flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{tpl.name}</div>
                      {tpl.type === "punch_list" ? (
                        <div className="mt-1 text-xs text-gray-500">{t("itemCount", { count: tpl.items.length })}</div>
                      ) : (
                        <div className="mt-1 text-xs text-gray-500">{tpl.defaultSubject}</div>
                      )}
                    </div>
                    <button onClick={() => remove(tpl.id)} className="text-gray-400 hover:text-error-600">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))
      )}
    </AuthenticatedShell>
  );
}
