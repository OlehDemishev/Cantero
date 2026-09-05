"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ChecklistTemplateType } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";

const TYPES: ChecklistTemplateType[] = ["punch_list", "rfi", "safety_briefing", "jha"];

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
  defaultHazards: string | null;
  defaultControlMeasures: string | null;
  defaultPpe: string | null;
  items: TemplateItem[];
  version: number;
  createdAt: string;
  previousVersionId: string | null;
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
  const [defaultHazards, setDefaultHazards] = useState("");
  const [defaultControlMeasures, setDefaultControlMeasures] = useState("");
  const [defaultPpe, setDefaultPpe] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([{ ...EMPTY_ITEM }]);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<Template[] | null>(null);

  function load() {
    apiFetch<Template[]>("/checklist-templates").then(setTemplates);
  }

  useEffect(load, []);

  function resetForm() {
    setName("");
    setDefaultSubject("");
    setDefaultBody("");
    setDefaultHazards("");
    setDefaultControlMeasures("");
    setDefaultPpe("");
    setItems([{ ...EMPTY_ITEM }]);
    setEditingId(null);
  }

  function startEdit(tpl: Template) {
    setType(tpl.type);
    setName(tpl.name);
    setDefaultSubject(tpl.defaultSubject ?? "");
    setDefaultBody(tpl.defaultBody ?? "");
    setDefaultHazards(tpl.defaultHazards ?? "");
    setDefaultControlMeasures(tpl.defaultControlMeasures ?? "");
    setDefaultPpe(tpl.defaultPpe ?? "");
    setItems(
      tpl.items.length > 0
        ? tpl.items.map((it) => ({ title: it.title, description: it.description ?? "", location: it.location ?? "" }))
        : [{ ...EMPTY_ITEM }],
    );
    setEditingId(tpl.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleHistory(id: string) {
    if (historyFor === id) {
      setHistoryFor(null);
      setHistory(null);
      return;
    }
    setHistoryFor(id);
    const versions = await apiFetch<Template[]>(`/checklist-templates/${id}/history`);
    setHistory(versions);
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
      const body = {
        type,
        name,
        items: type === "punch_list" ? items.filter((it) => it.title.trim()).map((it) => ({
          title: it.title,
          description: it.description || undefined,
          location: it.location || undefined,
        })) : undefined,
        defaultSubject: type !== "punch_list" ? defaultSubject : undefined,
        defaultBody: type !== "punch_list" && type !== "jha" ? defaultBody || undefined : undefined,
        defaultHazards: type === "jha" ? defaultHazards || undefined : undefined,
        defaultControlMeasures: type === "jha" ? defaultControlMeasures || undefined : undefined,
        defaultPpe: type === "jha" ? defaultPpe || undefined : undefined,
      };
      if (editingId) {
        const { type: _type, ...updateBody } = body;
        await apiFetch(`/checklist-templates/${editingId}`, { method: "PATCH", body: JSON.stringify(updateBody) });
      } else {
        await apiFetch("/checklist-templates", { method: "POST", body: JSON.stringify(body) });
      }
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
        <h2 className="mb-4 text-sm font-semibold text-gray-700">{editingId ? t("editTemplate") : t("newTemplate")}</h2>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("templateType")}</span>
            <select
              className="input"
              disabled={!!editingId}
              value={type}
              onChange={(e) => setType(e.target.value as ChecklistTemplateType)}
            >
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
          ) : type === "jha" ? (
            <>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700">{t("jhaTaskDescription")}</span>
                <input required className="input" value={defaultSubject} onChange={(e) => setDefaultSubject(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700">{t("jhaHazards")}</span>
                <textarea rows={2} className="input" value={defaultHazards} onChange={(e) => setDefaultHazards(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700">{t("jhaControlMeasures")}</span>
                <textarea rows={2} className="input" value={defaultControlMeasures} onChange={(e) => setDefaultControlMeasures(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700">{t("jhaPpe")}</span>
                <input className="input" value={defaultPpe} onChange={(e) => setDefaultPpe(e.target.value)} />
              </label>
            </>
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

          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary self-start">
              {editingId ? tc("save") : tc("create")}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="btn-secondary self-start">
                {tc("cancel")}
              </button>
            )}
          </div>
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
                  <li key={tpl.id} className="card">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{tpl.name}</span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{t("versionBadge", { version: tpl.version })}</span>
                        </div>
                        {tpl.type === "punch_list" ? (
                          <div className="mt-1 text-xs text-gray-500">{t("itemCount", { count: tpl.items.length })}</div>
                        ) : (
                          <div className="mt-1 text-xs text-gray-500">{tpl.defaultSubject}</div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button onClick={() => startEdit(tpl)} className="btn-secondary px-2.5 py-1 text-xs">
                          {tc("edit")}
                        </button>
                        {tpl.previousVersionId && (
                          <button onClick={() => toggleHistory(tpl.id)} className="btn-secondary px-2.5 py-1 text-xs">
                            {t("history")}
                          </button>
                        )}
                        <button onClick={() => remove(tpl.id)} className="text-gray-400 hover:text-error-600">
                          ×
                        </button>
                      </div>
                    </div>
                    {historyFor === tpl.id && (
                      <ul className="mt-3 flex flex-col gap-1 border-t border-gray-100 pt-3">
                        {history === null ? (
                          <li className="text-xs text-gray-400">{tc("loading")}</li>
                        ) : (
                          history.map((v) => (
                            <li key={v.id} className="flex items-center justify-between text-xs text-gray-500">
                              <span>{t("versionBadge", { version: v.version })}</span>
                              <span>{new Date(v.createdAt).toLocaleDateString()}</span>
                            </li>
                          ))
                        )}
                      </ul>
                    )}
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
