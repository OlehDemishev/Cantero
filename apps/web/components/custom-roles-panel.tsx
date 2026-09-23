"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MEMBERSHIP_ROLES_MANAGEABLE, PERMISSION_KEYS } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";

interface CustomRole {
  id: string;
  name: string;
  basePermissions: string[];
  extraPermissions?: string[];
  _count: { memberships: number };
}

export function CustomRolesPanel({ isManager }: { isManager: boolean }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const tp = useTranslations("permissions");
  const [customRoles, setCustomRoles] = useState<CustomRole[] | null>(null);
  const [customRoleForm, setCustomRoleForm] = useState({ name: "", basePermissions: [] as string[], extraPermissions: [] as string[] });
  const [creatingCustomRole, setCreatingCustomRole] = useState(false);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<CustomRole[]>("/company/custom-roles").then(setCustomRoles);
  }

  useEffect(load, []);

  function toggleCustomRolePermission(role: string) {
    setCustomRoleForm((f) => ({
      ...f,
      basePermissions: f.basePermissions.includes(role)
        ? f.basePermissions.filter((r) => r !== role)
        : [...f.basePermissions, role],
    }));
  }

  function toggleExtraPermission(permission: string) {
    setCustomRoleForm((f) => ({
      ...f,
      extraPermissions: f.extraPermissions.includes(permission) ? f.extraPermissions.filter((p) => p !== permission) : [...f.extraPermissions, permission],
    }));
  }

  async function createCustomRole(e: React.FormEvent) {
    e.preventDefault();
    if (!customRoleForm.name.trim() || customRoleForm.basePermissions.length === 0) return;
    setBusy(true);
    try {
      await apiFetch("/company/custom-roles", { method: "POST", body: JSON.stringify(customRoleForm) });
      setCustomRoleForm({ name: "", basePermissions: [], extraPermissions: [] });
      setCreatingCustomRole(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteCustomRole(id: string) {
    if (!window.confirm(t("confirmDeleteCustomRole"))) return;
    await apiFetch(`/company/custom-roles/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("customRoles")}</h2>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{t("customRolesHint")}</p>

      {!customRoles || customRoles.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noCustomRoles")}</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2">
          {customRoles.map((cr) => (
            <li key={cr.id} className="flex items-center justify-between rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2">
              <span className="text-sm">
                <span className="font-medium text-gray-800 dark:text-gray-100">{cr.name}</span>{" "}
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ({[...cr.basePermissions.map((p) => t(p)), ...(cr.extraPermissions ?? []).map((p) => tp(`p_${p.replace(/\./g, "_")}`))].join(" + ")})
                </span>
                {cr._count.memberships > 0 && (
                  <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">
                    {t("assignedToCount", { count: cr._count.memberships })}
                  </span>
                )}
              </span>
              {isManager && (
                <button onClick={() => deleteCustomRole(cr.id)} className="text-xs text-gray-400 dark:text-gray-500 hover:text-error-600">
                  {tc("delete")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isManager && (
        <>
          {!creatingCustomRole ? (
            <button onClick={() => setCreatingCustomRole(true)} className="btn-secondary px-3 py-1 text-xs">
              {t("newCustomRole")}
            </button>
          ) : (
            <form onSubmit={createCustomRole} className="flex flex-col gap-3">
              <input
                required
                placeholder={t("customRoleNamePlaceholder")}
                className="input"
                value={customRoleForm.name}
                onChange={(e) => setCustomRoleForm((f) => ({ ...f, name: e.target.value }))}
              />
              <div className="flex flex-wrap gap-3">
                {MEMBERSHIP_ROLES_MANAGEABLE.map((r) => (
                  <label key={r} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={customRoleForm.basePermissions.includes(r)}
                      onChange={() => toggleCustomRolePermission(r)}
                    />
                    {t(r)}
                  </label>
                ))}
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-gray-600 dark:text-gray-300">{t("customRoleExtraPermissions")}</summary>
                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {PERMISSION_KEYS.map((p) => (
                    <label key={p} className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                      <input type="checkbox" checked={customRoleForm.extraPermissions.includes(p)} onChange={() => toggleExtraPermission(p)} />
                      {tp(`p_${p.replace(/\./g, "_")}`)}
                    </label>
                  ))}
                </div>
              </details>
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="btn-primary">
                  {tc("create")}
                </button>
                <button type="button" onClick={() => setCreatingCustomRole(false)} className="btn-secondary">
                  {tc("cancel")}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
