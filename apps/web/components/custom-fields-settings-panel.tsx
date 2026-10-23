"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CUSTOM_FIELD_ENTITY_TYPES, CUSTOM_FIELD_TYPES, type CustomFieldEntityType, type CustomFieldType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, FormError } from "@/components/ui/field";

interface FieldDefinition {
  id: string;
  entityType: CustomFieldEntityType;
  name: string;
  type: CustomFieldType;
  options: string[];
}

export function CustomFieldsSettingsPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("customFields");
  const confirm = useConfirm();
  const tc = useTranslations("common");

  const { data: fields = null, reload: reloadFields, error: fieldsError } = useApi<FieldDefinition[]>("/custom-fields/definitions");
  const [form, setForm] = useState({ entityType: "project" as CustomFieldEntityType, name: "", type: "text" as CustomFieldType, options: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    void reloadFields();
  }

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
    if (!(await confirm({ message: t("confirmDelete"), tone: "danger", verb: "delete" }))) return;
    await apiFetch(`/custom-fields/definitions/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <p className="mb-4 text-xs text-fg-subtle">{t("hint")}</p>

      {!fields ? (
        fieldsError ? <ErrorState error={fieldsError} onRetry={reloadFields} compact /> : <Skeleton lines={3} />
      ) : fields.length === 0 ? (
        <p className="mb-4 text-sm text-fg-subtle">{t("noFields")}</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="mb-4 w-full border-collapse text-sm">
          <tbody>
            {fields.map((f) => (
              <tr key={f.id} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5">{f.name}</td>
                <td className="text-fg-subtle">{t(`entityType_${f.entityType}`)}</td>
                <td className="text-fg-subtle">{t(`fieldType_${f.type}`)}</td>
                <td className="text-fg-subtle">{f.type === "select" ? f.options.join(", ") : ""}</td>
                {canManage && (
                  <td className="text-right">
                    <button onClick={() => remove(f.id)} className="text-xs text-danger-fg hover:underline">
                      {tc("delete")}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {canManage && (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-t border-gray-100 dark:border-gray-700 pt-4">
          <Field label={t("entityType")} size="sm">
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
          </Field>
          <Field label={tc("name")} size="sm">
            <input
              required
              className="input w-auto"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label={t("fieldType")} size="sm">
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
          </Field>
          {form.type === "select" && (
            <Field label={t("optionsCommaSeparated")} size="sm" className="flex-1">
              <input
                required
                className="input"
                placeholder={t("optionsPlaceholder")}
                value={form.options}
                onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))}
              />
            </Field>
          )}
          <button type="submit" disabled={busy} className="btn-secondary">
            {t("addField")}
          </button>
        </form>
      )}
      {error && <FormError className="mt-2">{error}</FormError>}
    </section>
  );
}
