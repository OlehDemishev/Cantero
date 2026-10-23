"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format-date";
import { useCan } from "@/lib/permissions";

type TimeOffType = "vacation" | "sick" | "unpaid";
type TimeOffStatus = "pending" | "approved" | "denied";

interface Worker {
  id: string;
  name: string;
}
interface TimeOffRequest {
  id: string;
  type: TimeOffType;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: TimeOffStatus;
  worker: Worker;
}

export function TimeOffPanel() {
  const t = useTranslations("timeOff");
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");
  const canDecide = useCan()("site.crewTime");

  const { data: requests = null, reload: reloadRequests, error: requestsError } = useApi<TimeOffRequest[]>("/time-off");
  const { data: workers = [] } = useApi<Worker[]>("/workers");
  const [form, setForm] = useState({ workerId: "", type: "vacation" as TimeOffType, startDate: "", endDate: "", reason: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadRequests();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.endDate < form.startDate) return;
    setBusy(true);
    try {
      await apiFetch("/time-off", {
        method: "POST",
        body: JSON.stringify({
          workerId: form.workerId,
          type: form.type,
          startDate: new Date(form.startDate).toISOString(),
          endDate: new Date(form.endDate).toISOString(),
          reason: form.reason || undefined,
        }),
      });
      setForm({ workerId: "", type: "vacation", startDate: "", endDate: "", reason: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, approve: boolean) {
    setBusy(true);
    try {
      await apiFetch(`/time-off/${id}/decision`, { method: "POST", body: JSON.stringify({ approve }) });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <h3 className="mb-3 text-xs font-semibold text-fg-subtle">{t("newRequest")}</h3>
          <form onSubmit={submit} className="flex flex-col gap-2">
            <select aria-label={ta("worker")}
              required
              className="input"
              value={form.workerId}
              onChange={(e) => setForm((f) => ({ ...f, workerId: e.target.value }))}
            >
              <option value="">{t("selectWorker")}</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <select aria-label={t("type")}
              className="input"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as TimeOffType }))}
            >
              <option value="vacation">{t("vacation")}</option>
              <option value="sick">{t("sick")}</option>
              <option value="unpaid">{t("unpaid")}</option>
            </select>
            <input aria-label={ta("startDate")}
              required
              type="date"
              className="input"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value, endDate: f.endDate && f.endDate < e.target.value ? e.target.value : f.endDate }))}
            />
            <input aria-label={ta("endDate")}
              required
              type="date"
              min={form.startDate || undefined}
              className="input"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            />
            <input
              placeholder={t("reason")} aria-label={t("reason")}
              className="input"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            />
            <button type="submit" disabled={busy} className="btn-primary self-start">
              {tc("create")}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2">
          {!requests ? (
            requestsError ? <ErrorState error={requestsError} onRetry={reloadRequests} compact /> : <Skeleton lines={3} />
          ) : requests.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t("noRequests")}</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                  <th scope="col" className="py-2">{tc("name")}</th>
                  <th scope="col">{t("type")}</th>
                  <th scope="col">{t("dates")}</th>
                  <th scope="col">{tc("status")}</th>
                  {canDecide && <th scope="col"></th>}
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2">{r.worker.name}</td>
                    <td>{t(r.type)}</td>
                    <td>
                      {formatDate(new Date(r.startDate))} – {formatDate(new Date(r.endDate))}
                    </td>
                    <td>
                      <span
                        className={
                          r.status === "approved"
                            ? "text-xs text-success-fg"
                            : r.status === "denied"
                              ? "text-xs text-danger-fg"
                              : "text-xs text-fg-subtle"
                        }
                      >
                        {t(r.status)}
                      </span>
                    </td>
                    {canDecide && (
                      <td className="text-right">
                        {r.status === "pending" && (
                          <div className="flex justify-end gap-2 text-xs">
                            <button onClick={() => decide(r.id, true)} disabled={busy} className="text-success-fg hover:underline">
                              {t("approve")}
                            </button>
                            <button onClick={() => decide(r.id, false)} disabled={busy} className="text-danger-fg hover:underline">
                              {t("deny")}
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
