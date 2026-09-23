"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { TICKET_PRIORITIES, type TicketPriority } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";

interface SlaPolicy {
  id: string;
  priority: TicketPriority;
  responseMinutes: number;
  resolutionMinutes: number;
}

export function SlaPoliciesPanel() {
  const t = useTranslations("supportTickets");
  const tc = useTranslations("common");

  const [, setPolicies] = useState<Record<TicketPriority, SlaPolicy | undefined>>({} as Record<TicketPriority, SlaPolicy>);
  const [forms, setForms] = useState<Record<TicketPriority, { responseMinutes: string; resolutionMinutes: string }>>(
    Object.fromEntries(TICKET_PRIORITIES.map((p) => [p, { responseMinutes: "", resolutionMinutes: "" }])) as Record<
      TicketPriority,
      { responseMinutes: string; resolutionMinutes: string }
    >,
  );
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<SlaPolicy[]>("/support-tickets/sla-policies").then((list) => {
      const byPriority = Object.fromEntries(list.map((p) => [p.priority, p])) as Record<TicketPriority, SlaPolicy>;
      setPolicies(byPriority);
      setForms(
        Object.fromEntries(
          TICKET_PRIORITIES.map((p) => [
            p,
            {
              responseMinutes: byPriority[p]?.responseMinutes.toString() ?? "",
              resolutionMinutes: byPriority[p]?.resolutionMinutes.toString() ?? "",
            },
          ]),
        ) as Record<TicketPriority, { responseMinutes: string; resolutionMinutes: string }>,
      );
    });
  }
  useEffect(load, []);

  async function save(priority: TicketPriority) {
    const form = forms[priority];
    if (!form.responseMinutes || !form.resolutionMinutes) return;
    setBusy(true);
    try {
      await apiFetch("/support-tickets/sla-policies", {
        method: "POST",
        body: JSON.stringify({ priority, responseMinutes: Number(form.responseMinutes), resolutionMinutes: Number(form.resolutionMinutes) }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("slaPoliciesTitle")}</h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t("slaPoliciesHint")}</p>

      <div className="flex flex-col gap-2 max-w-lg">
        {TICKET_PRIORITIES.map((priority) => (
          <div key={priority} className="card flex flex-wrap items-end gap-2">
            <span className="w-20 text-sm font-medium text-gray-700 dark:text-gray-200">{t(`priority_${priority}`)}</span>
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("responseMinutes")}
              <input
                type="number"
                min="1"
                className="input w-28"
                value={forms[priority]?.responseMinutes ?? ""}
                onChange={(e) => setForms((f) => ({ ...f, [priority]: { ...f[priority], responseMinutes: e.target.value } }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("resolutionMinutes")}
              <input
                type="number"
                min="1"
                className="input w-28"
                value={forms[priority]?.resolutionMinutes ?? ""}
                onChange={(e) => setForms((f) => ({ ...f, [priority]: { ...f[priority], resolutionMinutes: e.target.value } }))}
              />
            </label>
            <button onClick={() => save(priority)} disabled={busy} className="btn-secondary px-3 py-1.5 text-xs">
              {tc("save")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
