"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { CustomFieldEntityType, CustomFieldType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";

interface FieldValue {
  fieldId: string;
  name: string;
  type: CustomFieldType;
  options: string[];
  value: string | null;
}

export function CustomFieldsValuesPanel({ entityType, entityId }: { entityType: CustomFieldEntityType; entityId: string }) {
  const t = useTranslations("customFields");
  const tc = useTranslations("common");

  const [fields, setFields] = useState<FieldValue[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  function load() {
    apiFetch<FieldValue[]>(`/custom-fields/${entityType}/${entityId}`).then((list) => {
      setFields(list);
      setDraft(Object.fromEntries(list.map((f) => [f.fieldId, f.value ?? ""])));
    });
  }

  useEffect(load, [entityType, entityId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    try {
      await apiFetch(`/custom-fields/${entityType}/${entityId}`, {
        method: "PATCH",
        body: JSON.stringify({
          values: Object.entries(draft).map(([fieldId, value]) => ({ fieldId, value: value === "" ? null : value })),
        }),
      });
      setSaved(true);
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!fields || fields.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <form onSubmit={save} className="card flex flex-wrap items-end gap-3">
        {fields.map((f) => (
          <label key={f.fieldId} className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{f.name}</span>
            {f.type === "boolean" ? (
              <input
                type="checkbox"
                className="mt-1"
                checked={draft[f.fieldId] === "true"}
                onChange={(e) => setDraft((d) => ({ ...d, [f.fieldId]: e.target.checked ? "true" : "false" }))}
              />
            ) : f.type === "select" ? (
              <select
                className="input"
                value={draft[f.fieldId] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [f.fieldId]: e.target.value }))}
              >
                <option value="">{tc("none")}</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                className="input"
                value={draft[f.fieldId] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [f.fieldId]: e.target.value }))}
              />
            )}
          </label>
        ))}
        <button type="submit" disabled={busy} className="btn-secondary">
          {tc("save")}
        </button>
        {saved && <span className="text-xs text-success-700">{tc("saved")}</span>}
      </form>
    </div>
  );
}
