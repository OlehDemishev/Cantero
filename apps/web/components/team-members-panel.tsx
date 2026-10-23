"use client";

import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssignableRoles } from "@/lib/permissions";
import { useConfirm } from "@/components/ui/confirm-dialog";

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
  const confirm = useConfirm();
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");
  const { data: members = null, reload: reloadMembers, error: membersError } = useApi<Member[]>("/company/members");
  const { data: customRoles = [], reload: reloadCustomRoles } = useApi<CustomRole[]>("/company/custom-roles");
  const { roles: assignableRoles, mayTouchAdmin } = useAssignableRoles();
  const isAdminLevel = (customRoleId: string | undefined) => !!customRoles.find((cr) => cr.id === customRoleId)?.basePermissions.includes("admin");
  // Owner rows are never editable; admin rows (or an admin-based custom role) only by the owner.
  const editable = (m: Member) => isManager && m.role !== "owner" && (mayTouchAdmin || (m.role !== "admin" && !isAdminLevel(m.customRole?.id)));

  function load() {
    void reloadMembers();
    void reloadCustomRoles();
  }

  async function updateMemberRole(userId: string, role: string) {
    await apiFetch(`/company/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) });
    load();
  }

  async function removeMember(userId: string) {
    if (!(await confirm({ message: t("confirmRemoveMember"), tone: "danger", verb: "remove" }))) return;
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
      <h2 className="mb-4 text-sm font-semibold text-fg-muted">{t("members")}</h2>
      {!members ? (
        membersError ? <ErrorState error={membersError} onRetry={reloadMembers} compact /> : <Skeleton lines={3} />
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
              <th scope="col" className="py-2">{tc("name")}</th>
              <th scope="col">{tc("email")}</th>
              <th scope="col">{t("role")}</th>
              <th scope="col">{t("customRole")}</th>
              {isManager && <th scope="col"></th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-2">{m.user.name}</td>
                <td>{m.user.email}</td>
                <td>
                  {editable(m) ? (
                    <select aria-label={ta("fieldOf", { field: t("role"), item: m.user.name })}
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
                    <select aria-label={ta("fieldOf", { field: t("customRole"), item: m.user.name })}
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
