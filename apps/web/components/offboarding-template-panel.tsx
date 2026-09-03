"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface OffboardingTemplateItem {
  id: string;
  title: string;
  sortOrder: number;
}

export function OffboardingTemplatePanel() {
  const t = useTranslations("team");
  const tc = useTranslations("common");

  const [items, setItems] = useState<OffboardingTemplateItem[] | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<OffboardingTemplateItem[]>("/company/offboarding-template").then(setItems);
  }

  useEffect(load, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/company/offboarding-template", { method: "POST", body: JSON.stringify({ title }) });
      setTitle("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/company/offboarding-template/${id}`, { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("offboardingTemplate")}</h2>
      <p className="mb-4 text-sm text-gray-500">{t("offboardingTemplateHint")}</p>

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

      <ul className="mt-4 flex max-w-md flex-col gap-1.5">
        {items === null ? (
          <p className="text-sm text-gray-400">{tc("loading")}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400">—</p>
        ) : (
          items.map((item) => (
            <li key={item.id} className="card flex items-center justify-between text-sm">
              <span>{item.title}</span>
              <button onClick={() => remove(item.id)} disabled={busy} className="text-xs text-error-700 hover:underline">
                {tc("delete")}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
