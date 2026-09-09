"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MEMBERSHIP_ROLES_MANAGEABLE, type MembershipRole } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { HelpTooltip } from "@/components/help-tooltip";

interface Company {
  sessionTimeoutMinutes: number | null;
  passwordMinLength: number;
  passwordRequireSymbol: boolean;
  hideCostDataFromRoles: MembershipRole[];
}

const COST_HIDABLE_ROLES = MEMBERSHIP_ROLES_MANAGEABLE.filter((r) => r !== "admin");

export function SecuritySettingsPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("security");
  const ts = useTranslations("settings");
  const tc = useTranslations("common");

  const [form, setForm] = useState({
    sessionTimeoutMinutes: "",
    passwordMinLength: "8",
    passwordRequireSymbol: false,
    hideCostDataFromRoles: [] as MembershipRole[],
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  function load() {
    apiFetch<Company>("/company").then((c) => {
      setForm({
        sessionTimeoutMinutes: c.sessionTimeoutMinutes !== null ? String(c.sessionTimeoutMinutes) : "",
        passwordMinLength: String(c.passwordMinLength),
        passwordRequireSymbol: c.passwordRequireSymbol,
        hideCostDataFromRoles: c.hideCostDataFromRoles,
      });
    });
  }

  useEffect(load, []);

  function toggleRole(role: MembershipRole) {
    setForm((f) => ({
      ...f,
      hideCostDataFromRoles: f.hideCostDataFromRoles.includes(role)
        ? f.hideCostDataFromRoles.filter((r) => r !== role)
        : [...f.hideCostDataFromRoles, role],
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    try {
      await apiFetch("/company", {
        method: "PATCH",
        body: JSON.stringify({
          sessionTimeoutMinutes: form.sessionTimeoutMinutes ? Number(form.sessionTimeoutMinutes) : null,
          passwordMinLength: Number(form.passwordMinLength) || 8,
          passwordRequireSymbol: form.passwordRequireSymbol,
          hideCostDataFromRoles: form.hideCostDataFromRoles,
        }),
      });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) return null;

  return (
    <section className="card">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      <form onSubmit={save} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            {t("sessionTimeout")}
            <HelpTooltip text={t("sessionTimeoutTooltip")} />
          </span>
          <input
            type="number"
            min="5"
            max="43200"
            placeholder={t("sessionTimeoutPlaceholder")}
            className="input w-40"
            value={form.sessionTimeoutMinutes}
            onChange={(e) => setForm((f) => ({ ...f, sessionTimeoutMinutes: e.target.value }))}
          />
        </label>

        <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
          <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-200">{t("passwordPolicy")}</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("passwordMinLength")}
              <input
                type="number"
                min="8"
                max="64"
                className="input w-24"
                value={form.passwordMinLength}
                onChange={(e) => setForm((f) => ({ ...f, passwordMinLength: e.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 pb-2 text-xs text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                checked={form.passwordRequireSymbol}
                onChange={(e) => setForm((f) => ({ ...f, passwordRequireSymbol: e.target.checked }))}
              />
              {t("passwordRequireSymbol")}
            </label>
          </div>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-200">
            {t("hideCostData")}
            <HelpTooltip text={t("hideCostDataTooltip")} />
          </p>
          <div className="flex flex-wrap gap-3">
            {COST_HIDABLE_ROLES.map((role) => (
              <label key={role} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={form.hideCostDataFromRoles.includes(role)}
                  onChange={() => toggleRole(role)}
                />
                {ts(role)}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="submit" disabled={busy} className="btn-secondary self-start">
            {tc("save")}
          </button>
          {saved && <span className="text-xs text-success-700 dark:text-success-500">{tc("saved")}</span>}
        </div>
      </form>
    </section>
  );
}
