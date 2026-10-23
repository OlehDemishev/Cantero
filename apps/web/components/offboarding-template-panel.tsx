"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FormError } from "@/components/ui/field";

interface OffboardingTemplateItem {
  id: string;
  title: string;
  sortOrder: number;
}

export function OffboardingTemplatePanel() {
  const t = useTranslations("team");
  const confirm = useConfirm();
  const td = useTranslations("dialog");
  const tc = useTranslations("common");

  const { data: items = null, reload: reloadItems, error: itemsError } = useApi<OffboardingTemplateItem[]>("/company/offboarding-template");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    void reloadItems();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/company/offboarding-template", { method: "POST", body: JSON.stringify({ title }) });
      setTitle("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!(await confirm({ message: td("removeTemplateItem"), tone: "danger", verb: "remove" }))) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/company/offboarding-template/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("offboardingTemplate")}</h2>
      <p className="mb-4 text-sm text-fg-subtle">{t("offboardingTemplateHint")}</p>

      <form onSubmit={handleSubmit} className="flex max-w-md gap-2">
        <input
          required
          placeholder={t("offboardingTaskTitlePlaceholder")}
          className="input flex-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" disabled={busy} className="btn-secondary">
          {t("addOffboardingTask")}
        </button>
      </form>
      {error && <FormError className="mt-1.5">{error}</FormError>}

      <ul className="mt-4 flex max-w-md flex-col gap-1.5">
        {items === null ? (
          itemsError ? <ErrorState error={itemsError} onRetry={reloadItems} compact /> : <Skeleton lines={3} />
        ) : items.length === 0 ? (
          <p className="text-sm text-fg-subtle">{t("noOffboardingTasks")}</p>
        ) : (
          items.map((item) => (
            <li key={item.id} className="card flex items-center justify-between text-sm">
              <span>{item.title}</span>
              <button onClick={() => remove(item.id)} disabled={busy} className="text-xs text-danger-fg hover:underline">
                {tc("delete")}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
