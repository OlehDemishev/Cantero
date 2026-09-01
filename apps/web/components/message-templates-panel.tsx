"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api-client";

interface TemplateEntry {
  key: string;
  placeholders: string[];
  customBody: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
}

export function MessageTemplatesPanel() {
  const t = useTranslations("messageTemplates");
  const [templates, setTemplates] = useState<TemplateEntry[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<{ key: string; message: string } | null>(null);

  function load() {
    apiFetch<TemplateEntry[]>("/message-templates").then((entries) => {
      setTemplates(entries);
      setDrafts(Object.fromEntries(entries.map((e) => [e.key, e.customBody ?? ""])));
    });
  }

  useEffect(load, []);

  async function save(key: string) {
    setBusyKey(key);
    setErrorKey(null);
    try {
      await apiFetch(`/message-templates/${key}`, { method: "PATCH", body: JSON.stringify({ body: drafts[key] }) });
      load();
    } catch (err) {
      setErrorKey({ key, message: err instanceof ApiError ? err.message : t("error") });
    } finally {
      setBusyKey(null);
    }
  }

  async function reset(key: string) {
    setBusyKey(key);
    setErrorKey(null);
    try {
      await apiFetch(`/message-templates/${key}`, { method: "DELETE" });
      load();
    } finally {
      setBusyKey(null);
    }
  }

  if (!templates) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("description")}</p>
      <div className="flex flex-col gap-3">
        {templates.map((entry) => (
          <div key={entry.key} className="card">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-800">{t(`key_${entry.key}`)}</span>
              {entry.customBody !== null && (
                <button onClick={() => reset(entry.key)} disabled={busyKey === entry.key} className="text-xs text-gray-400 hover:text-error-700">
                  {t("resetToDefault")}
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {t("placeholders")}: {entry.placeholders.map((p) => `{{${p}}}`).join(", ")}
            </p>
            <textarea
              className="input mt-2 h-20 text-xs"
              placeholder={t("placeholder")}
              value={drafts[entry.key] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [entry.key]: e.target.value }))}
            />
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => save(entry.key)} disabled={busyKey === entry.key || !drafts[entry.key]?.trim()} className="btn-secondary px-2 py-1 text-xs">
                {t("save")}
              </button>
              {entry.customBody !== null && entry.updatedByName && (
                <span className="text-xs text-gray-400">
                  {t("customizedBy", { name: entry.updatedByName })}
                </span>
              )}
            </div>
            {errorKey?.key === entry.key && <p className="mt-1 text-xs text-error-700">{errorKey.message}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
