"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface Summary {
  pushed: number;
  failed: number;
  errors: string[];
}

/** Project-scoped push to a connected Sage Intacct — see IntacctService for exactly what is (a
 * contract header, change orders as drafts) and isn't (lines, billing, amounts) sent. Renders
 * nothing until the company has connected Intacct in Settings. */
export function IntacctProjectPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("intacct");
  const [connected, setConnected] = useState(false);
  const [project, setProject] = useState({ intacctProjectId: "", intacctContractId: null as string | null });
  const [customerId, setCustomerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    apiFetch<{ connected: boolean }>("/company/intacct/status")
      .then((s) => setConnected(s.connected))
      .catch(() => setConnected(false));
    apiFetch<{ intacctProjectId: string | null; intacctContractId: string | null; client: { intacctCustomerId: string | null } | null }>(`/projects/${projectId}`)
      .then((p) => {
        setProject({ intacctProjectId: p.intacctProjectId ?? "", intacctContractId: p.intacctContractId });
        setCustomerId(p.client?.intacctCustomerId ?? "");
      })
      .catch(() => undefined);
  }

  useEffect(load, [projectId]);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setMessage(await action());
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pushFailed"));
    } finally {
      setBusy(false);
    }
  }

  const pushContract = () =>
    run(async () => {
      const r = await apiFetch<{ contractId: string }>(`/projects/${projectId}/intacct/contract`, {
        method: "POST",
        body: JSON.stringify({ intacctProjectId: project.intacctProjectId, intacctCustomerId: customerId }),
      });
      return t("contractPushed", { id: r.contractId });
    });

  const pushChangeOrders = () =>
    run(async () => {
      const r = await apiFetch<Summary>(`/projects/${projectId}/intacct/change-orders`, { method: "POST" });
      return t("changeOrdersResult", { pushed: r.pushed, failed: r.failed }) + (r.errors.length ? ` ${r.errors.slice(0, 3).join("; ")}` : "");
    });

  if (!connected) return null;

  return (
    <section className="card">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("projectTitle")}</h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("projectHint")}</p>
      {error && <p className="mb-2 whitespace-pre-line text-xs text-error-600">{error}</p>}
      {message && <p className="mb-2 text-xs text-gray-600 dark:text-gray-300">{message}</p>}

      {project.intacctContractId ? (
        <p className="mb-3 text-xs text-success-700 dark:text-success-500">{t("contractExists", { id: project.intacctContractId })}</p>
      ) : (
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
            {t("intacctProjectId")}
            <input className="input" value={project.intacctProjectId} onChange={(e) => setProject((p) => ({ ...p, intacctProjectId: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
            {t("intacctCustomerId")}
            <input className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} />
          </label>
          <button onClick={pushContract} disabled={busy || !project.intacctProjectId.trim() || !customerId.trim()} className="btn-secondary px-2.5 py-1.5 text-xs">
            {t("pushContract")}
          </button>
        </div>
      )}

      <button onClick={pushChangeOrders} disabled={busy || !project.intacctContractId} className="btn-secondary px-2.5 py-1.5 text-xs">
        {t("pushChangeOrders")}
      </button>
    </section>
  );
}
