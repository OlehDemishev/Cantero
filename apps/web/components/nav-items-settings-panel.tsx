"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { NAV_GROUPS } from "@/components/authenticated-shell";

interface Company {
  hiddenNavItems: string[];
}

/** Lets an owner/admin hide sidebar sections this company doesn't use — a general contractor and
 * a remodeler need a very different subset of this app's ~33 modules, and a menu trimmed to what
 * a company actually uses is easier to scan than the full list. Mirrors
 * SecuritySettingsPanel's hideCostDataFromRoles checkbox pattern; NAV_GROUPS (imported from
 * AuthenticatedShell, not redefined here) is the single source of truth for which items exist. */
export function NavItemsSettingsPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("navSettings");
  const tn = useTranslations("nav");
  const tc = useTranslations("common");

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch<Company>("/company").then((c) => setHidden(new Set(c.hiddenNavItems)));
  }, []);

  function toggleItem(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    try {
      await apiFetch("/company", { method: "PATCH", body: JSON.stringify({ hiddenNavItems: [...hidden] }) });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) return null;

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.key}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {tn(`group_${group.key}`)}
              </p>
              <div className="flex flex-col gap-1.5">
                {group.items.map((item) => (
                  <label key={item.key} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-200">
                    <input type="checkbox" checked={!hidden.has(item.key)} onChange={() => toggleItem(item.key)} />
                    {tn(item.key)}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
          <button type="submit" disabled={busy} className="btn-secondary self-start">
            {tc("save")}
          </button>
          {saved && <span className="text-xs text-success-700 dark:text-success-500">{tc("saved")}</span>}
        </div>
      </form>
    </section>
  );
}
