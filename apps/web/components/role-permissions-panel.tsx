"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useCan } from "@/lib/permissions";

interface Matrix {
  permissions: { key: string; section: string; sensitive: boolean }[];
  roles: { role: string; editable: boolean }[];
  grants: { role: string; permission: string; granted: boolean; isDefault: boolean }[];
}

const cellKey = (role: string, permission: string) => `${role}:${permission}`;

/**
 * Settings → Team → Roles & permissions: every role × capability as a grid of switches. A cell that
 * differs from Cantero's default is marked; each role and the whole grid can go back to the defaults.
 * Granting money, pay or HR data to a worker asks first. The owner's column is fixed, and an admin's
 * can only be changed by the owner — the API enforces both, the grid just shows them as locked.
 */
export function RolePermissionsPanel() {
  const t = useTranslations("permissions");
  const ts = useTranslations("settings");
  const can = useCan();
  const allowed = can("settings.roles");
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<Matrix>("/company/permissions").then(setMatrix).catch(() => setMatrix(null));
  }, []);
  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const cells = useMemo(() => new Map((matrix?.grants ?? []).map((g) => [cellKey(g.role, g.permission), g])), [matrix]);
  const sections = useMemo(() => {
    const bySection = new Map<string, Matrix["permissions"]>();
    for (const p of matrix?.permissions ?? []) bySection.set(p.section, [...(bySection.get(p.section) ?? []), p]);
    return [...bySection.entries()];
  }, [matrix]);

  if (!allowed || !matrix) return null;

  async function toggle(role: string, permission: { key: string; sensitive: boolean }, granted: boolean) {
    if (granted && permission.sensitive && role === "worker" && !window.confirm(t("confirmSensitive", { role: ts(role) }))) return;
    const key = cellKey(role, permission.key);
    const previous = matrix;
    // Flip it at once; the server's answer then settles whether it's still the default.
    setMatrix((m) => m && { ...m, grants: m.grants.map((g) => (g.role === role && g.permission === permission.key ? { ...g, granted } : g)) });
    setSaving(key);
    try {
      await apiFetch("/company/permissions", { method: "PATCH", body: JSON.stringify({ role, permission: permission.key, granted }) });
      load();
    } catch {
      setMatrix(previous);
    } finally {
      setSaving(null);
    }
  }

  async function reset(role?: string) {
    if (!role && !window.confirm(t("confirmResetAll"))) return;
    await apiFetch("/company/permissions/reset", { method: "POST", body: JSON.stringify(role ? { role } : {}) });
    load();
  }

  const changedRoles = new Set(matrix.grants.filter((g) => !g.isDefault).map((g) => g.role));

  return (
    <section className="card lg:col-span-2" aria-labelledby="role-permissions-title">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="role-permissions-title" className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {t("title")}
        </h2>
        {changedRoles.size > 0 && (
          <button onClick={() => reset()} className="text-xs text-gray-500 underline-offset-2 hover:underline dark:text-gray-400">
            {t("resetAll")}
          </button>
        )}
      </div>
      <p className="mb-4 max-w-prose text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
              <th className="py-2 pr-3 font-medium">{t("permission")}</th>
              {matrix.roles.map(({ role, editable }) => (
                <th key={role} className="px-2 py-2 text-center font-medium" title={!editable ? (role === "owner" ? t("ownerLocked") : t("adminOwnerOnly")) : undefined}>
                  <span className="block">{ts(role)}</span>
                  {editable && changedRoles.has(role) && (
                    <button onClick={() => reset(role)} className="mt-0.5 text-[11px] font-normal text-brand-600 hover:underline dark:text-brand-400">
                      {t("resetRole", { role: ts(role) })}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map(([section, permissions]) => (
              <Fragment key={section}>
                <tr>
                  <th colSpan={matrix.roles.length + 1} className="pb-1 pt-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {t(`section_${section}`)}
                  </th>
                </tr>
                {permissions.map((permission) => {
                  const slug = permission.key.replace(/\./g, "_");
                  return (
                    <tr key={permission.key} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 pr-3 align-top">
                        <span className="block font-medium text-gray-800 dark:text-gray-100">{t(`p_${slug}`)}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">{t(`p_${slug}_hint`)}</span>
                      </td>
                      {matrix.roles.map(({ role, editable }) => {
                        const cell = cells.get(cellKey(role, permission.key));
                        const key = cellKey(role, permission.key);
                        return (
                          <td key={role} className="px-2 py-2 text-center align-top">
                            <label className="relative inline-flex items-center justify-center">
                              <input
                                type="checkbox"
                                className="size-4 accent-brand-600 disabled:opacity-50"
                                checked={!!cell?.granted}
                                disabled={!editable}
                                aria-label={`${t(`p_${slug}`)} — ${ts(role)}`}
                                onChange={(e) => saving !== key && toggle(role, permission, e.target.checked)}
                              />
                              {cell && !cell.isDefault && (
                                <span className="absolute -right-2 -top-1 size-1.5 rounded-full bg-warning-500" title={t("changed")} aria-label={t("changed")} />
                              )}
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
