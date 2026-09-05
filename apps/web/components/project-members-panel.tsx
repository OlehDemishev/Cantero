"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { HelpTooltip } from "@/components/help-tooltip";

interface ProjectMember {
  id: string;
  userId: string;
  user: { id: string; name: string; email: string };
}
interface CompanyMember {
  userId: string;
  user: { id: string; name: string; email: string };
}
interface Project {
  restrictedToMembers: boolean;
}

export function ProjectMembersPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("projectMembers");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const canManage = me?.user.role === "owner" || me?.user.role === "admin";

  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[] | null>(null);
  const [companyMembers, setCompanyMembers] = useState<CompanyMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Project>(`/projects/${projectId}`).then(setProject);
    apiFetch<ProjectMember[]>(`/projects/${projectId}/members`).then(setMembers);
  }

  useEffect(load, [projectId]);
  useEffect(() => {
    if (canManage) apiFetch<CompanyMember[]>("/company/members").then(setCompanyMembers);
  }, [canManage]);

  async function toggleRestricted() {
    if (!project) return;
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/restricted`, {
        method: "PATCH",
        body: JSON.stringify({ restrictedToMembers: !project.restrictedToMembers }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserId) return;
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/members`, { method: "POST", body: JSON.stringify({ userId: selectedUserId }) });
      setSelectedUserId("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string) {
    if (!window.confirm(t("confirmRemove"))) return;
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/members/${userId}`, { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) return null;

  const availableMembers = companyMembers.filter((cm) => !members?.some((m) => m.userId === cm.userId));

  return (
    <div className="mt-8">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
        {t("title")}
        <HelpTooltip text={t("tooltip")} />
      </h2>
      <div className="card">
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" className="mt-0.5" checked={project?.restrictedToMembers ?? false} onChange={toggleRestricted} disabled={busy} />
          <span>
            <span className="font-medium text-gray-700">{t("restrictToggle")}</span>
            <span className="mt-0.5 block text-xs text-gray-500">{t("restrictToggleHint")}</span>
          </span>
        </label>

        {project?.restrictedToMembers && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            {!members || members.length === 0 ? (
              <p className="text-sm text-gray-400">{t("noMembers")}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">
                      {m.user.name} <span className="text-gray-400">({m.user.email})</span>
                    </span>
                    <button onClick={() => removeMember(m.userId)} className="text-gray-400 hover:text-error-600">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {availableMembers.length > 0 && (
              <form onSubmit={addMember} className="mt-3 flex items-center gap-2">
                <select className="input" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                  <option value="">{t("selectMember")}</option>
                  {availableMembers.map((cm) => (
                    <option key={cm.userId} value={cm.userId}>
                      {cm.user.name}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={busy || !selectedUserId} className="btn-secondary shrink-0">
                  {tc("add")}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
