"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface OnboardingTemplateItem {
  id: string;
  title: string;
  sortOrder: number;
}

export function OnboardingTemplatePanel() {
  const t = useTranslations("team");
  const confirm = useConfirm();
  const td = useTranslations("dialog");
  const tc = useTranslations("common");

  const { data: items = null, reload: reloadItems, error: itemsError } = useApi<OnboardingTemplateItem[]>("/company/onboarding-template");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadItems();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/company/onboarding-template", { method: "POST", body: JSON.stringify({ title }) });
      setTitle("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!(await confirm({ message: td("removeTemplateItem"), tone: "danger", verb: "remove" }))) return;
    setBusy(true);
    try {
      await apiFetch(`/company/onboarding-template/${id}`, { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("onboardingTemplate")}</h2>
      <p className="mb-4 text-sm text-fg-subtle">{t("onboardingTemplateHint")}</p>

      <form onSubmit={handleSubmit} className="flex max-w-md gap-2">
        <input
          required
          placeholder={t("onboardingTaskTitlePlaceholder")}
          className="input flex-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" disabled={busy} className="btn-secondary">
          {t("addOnboardingTask")}
        </button>
      </form>

      <ul className="mt-4 flex max-w-md flex-col gap-1.5">
        {items === null ? (
          itemsError ? <ErrorState error={itemsError} onRetry={reloadItems} compact /> : <Skeleton lines={3} />
        ) : items.length === 0 ? (
          <p className="text-sm text-fg-subtle">{t("noOnboardingTasks")}</p>
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
