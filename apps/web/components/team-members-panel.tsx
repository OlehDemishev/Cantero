"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAssignableRoles } from "@/lib/permissions";

interface CustomRole {
  id: string;
  name: string;
  basePermissions: string[];
}
interface Member {
  userId: string;
  role: string;
  user: { id: string; email: string; name: string };
  customRole: { id: string; name: string } | null;
}

export function TeamMembersPanel({ isManager }: { isManager: boolean }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [members, setMembers] = useState<Member[] | null>(null);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const { roles: assignableRoles, mayTouchAdmin } = useAssignableRoles();
  const isAdminLevel = (customRoleId: string | undefined) => !!customRoles.find((cr) => cr.id === customRoleId)?.basePermissions.includes("admin");
  // Owner rows are never editable; admin rows (or an admin-based custom role) only by the owner.
  const editable = (m: Member) => isManager && m.role !== "owner" && (mayTouchAdmin || (m.role !== "admin" && !isAdminLevel(m.customRole?.id)));

  function load() {
    apiFetch<Member[]>("/company/members").then(setMembers);
    apiFetch<CustomRole[]>("/company/custom-roles").then(setCustomRoles);
  }

  useEffect(load, []);

  async function updateMemberRole(userId: string, role: string) {
    await apiFetch(`/company/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) });
    load();
  }

  async function removeMember(userId: string) {
    if (!window.confirm(t("confirmRemoveMember"))) return;
    await apiFetch(`/company/members/${userId}`, { method: "DELETE" });
    load();
  }

  async function assignCustomRole(userId: string, customRoleId: string) {
    await apiFetch(`/company/members/${userId}/custom-role`, {
      method: "PATCH",
      body: JSON.stringify({ customRoleId: customRoleId || null }),
    });
    load();
  }

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("members")}</h2>
      {!members ? (
        <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="py-2">{tc("name")}</th>
              <th>{tc("email")}</th>
              <th>{t("role")}</th>
              <th>{t("customRole")}</th>
              {isManager && <th></th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-2">{m.user.name}</td>
                <td>{m.user.email}</td>
                <td>
                  {editable(m) ? (
                    <select
                      className="input w-auto"
                      value={m.role}
                      onChange={(e) => updateMemberRole(m.userId, e.target.value)}
                    >
                      {assignableRoles.map((r) => (
                        <option key={r} value={r}>
                          {t(r)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    t(m.role)
                  )}
                </td>
                <td>
                  {editable(m) ? (
                    <select
                      className="input w-auto"
                      value={m.customRole?.id ?? ""}
                      onChange={(e) => assignCustomRole(m.userId, e.target.value)}
                    >
                      <option value="">{t("noCustomRole")}</option>
                      {customRoles.filter((cr) => mayTouchAdmin || !cr.basePermissions.includes("admin")).map((cr) => (
                        <option key={cr.id} value={cr.id}>
                          {cr.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    m.customRole?.name ?? "—"
                  )}
                </td>
                {isManager && (
                  <td>
                    {editable(m) && (
                      <button onClick={() => removeMember(m.userId)} className="btn-secondary px-2 py-1 text-xs">
                        {t("remove")}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}
