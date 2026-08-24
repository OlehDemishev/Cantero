"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CUSTOM_FIELD_ENTITY_TYPES, CUSTOM_FIELD_TYPES, type CustomFieldEntityType, type CustomFieldType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";

interface FieldDefinition {
  id: string;
  entityType: CustomFieldEntityType;
  name: string;
  type: CustomFieldType;
  options: string[];
}

export function CustomFieldsSettingsPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("customFields");
  const tc = useTranslations("common");

  const [fields, setFields] = useState<FieldDefinition[] | null>(null);
  const [form, setForm] = useState({ entityType: "project" as CustomFieldEntityType, name: "", type: "text" as CustomFieldType, options: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<FieldDefinition[]>("/custom-fields/definitions").then(setFields);
  }

  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/custom-fields/definitions", {
        method: "POST",
        body: JSON.stringify({
          entityType: form.entityType,
          name: form.name,
          type: form.type,
          options:
            form.type === "select"
              ? form.options
                  .split(",")
                  .map((o) => o.trim())
                  .filter(Boolean)
              : undefined,
        }),
      });
      setForm((f) => ({ ...f, name: "", options: "" }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await apiFetch(`/custom-fields/definitions/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-4 text-xs text-gray-500">{t("hint")}</p>

      {!fields ? (
        <p className="text-gray-500">{tc("loading")}</p>
      ) : fields.length === 0 ? (
        <p className="mb-4 text-sm text-gray-400">{t("noFields")}</p>
      ) : (
        <table className="mb-4 w-full border-collapse text-sm">
          <tbody>
            {fields.map((f) => (
              <tr key={f.id} className="border-b border-gray-100">
                <td className="py-1.5">{f.name}</td>
                <td className="text-gray-500">{t(`entityType_${f.entityType}`)}</td>
                <td className="text-gray-500">{t(`fieldType_${f.type}`)}</td>
                <td className="text-gray-400">{f.type === "select" ? f.options.join(", ") : ""}</td>
                {canManage && (
                  <td className="text-right">
                    <button onClick={() => remove(f.id)} className="text-xs text-error-600 hover:underline">
                      {tc("delete")}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canManage && (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-4">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            {t("entityType")}
            <select
              className="input w-auto"
              value={form.entityType}
              onChange={(e) => setForm((f) => ({ ...f, entityType: e.target.value as CustomFieldEntityType }))}
            >
              {CUSTOM_FIELD_ENTITY_TYPES.map((et) => (
                <option key={et} value={et}>
                  {t(`entityType_${et}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            {tc("name")}
            <input
              required
              className="input w-auto"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            {t("fieldType")}
            <select
              className="input w-auto"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CustomFieldType }))}
            >
              {CUSTOM_FIELD_TYPES.map((ft) => (
                <option key={ft} value={ft}>
                  {t(`fieldType_${ft}`)}
                </option>
              ))}
            </select>
          </label>
          {form.type === "select" && (
            <label className="flex flex-1 flex-col gap-1 text-xs text-gray-500">
              {t("optionsCommaSeparated")}
              <input
                required
                className="input"
                placeholder={t("optionsPlaceholder")}
                value={form.options}
                onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))}
              />
            </label>
          )}
          <button type="submit" disabled={busy} className="btn-secondary">
            {t("addField")}
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-xs text-error-600">{error}</p>}
    </section>
  );
}
