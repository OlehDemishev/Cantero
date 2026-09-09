"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

type ChangeRequestStatus = "submitted" | "under_review" | "converted" | "declined";
interface ChangeRequest {
  id: string;
  title: string;
  description: string;
  status: ChangeRequestStatus;
  reviewNote: string | null;
  submittedByClient: { name: string };
  convertedChangeOrder: { id: string; number: number } | null;
}

const STATUS_STYLES: Record<ChangeRequestStatus, string> = {
  submitted: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
  under_review: "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400",
  converted: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
  declined: "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500",
};

export function ClientChangeRequestsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("clientChangeRequests");
  const tc = useTranslations("common");

  const [requests, setRequests] = useState<ChangeRequest[] | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [changeOrderId, setChangeOrderId] = useState("");
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<ChangeRequest[]>(`/client-change-requests?projectId=${projectId}`).then(setRequests);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (requests !== null && requests.length === 0) return null;

  async function startReview(id: string) {
    await apiFetch(`/client-change-requests/${id}/start-review`, { method: "POST" });
    load();
  }

  async function convert(id: string) {
    if (!changeOrderId) return;
    setBusy(true);
    try {
      await apiFetch(`/client-change-requests/${id}/convert`, { method: "POST", body: JSON.stringify({ changeOrderId }) });
      setConvertingId(null);
      setChangeOrderId("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function decline(id: string) {
    if (!declineNote) return;
    setBusy(true);
    try {
      await apiFetch(`/client-change-requests/${id}/decline`, { method: "POST", body: JSON.stringify({ reviewNote: declineNote }) });
      setDecliningId(null);
      setDeclineNote("");
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>

      {requests === null ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.map((r) => (
            <li key={r.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{r.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}>{t(r.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("submittedBy", { name: r.submittedByClient.name })}</p>
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{r.description}</p>
                  {r.convertedChangeOrder && <p className="mt-1.5 text-xs text-success-700 dark:text-success-500">{t("linkedTo", { number: r.convertedChangeOrder.number })}</p>}
                  {r.status === "declined" && r.reviewNote && <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{t("declineReason", { note: r.reviewNote })}</p>}
                </div>
              </div>

              {r.status === "submitted" && (
                <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                  <button onClick={() => startReview(r.id)} className="btn-secondary px-2.5 py-1 text-xs">
                    {t("startReview")}
                  </button>
                </div>
              )}

              {r.status === "under_review" && (
                <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 dark:border-gray-700 pt-3">
                  {convertingId === r.id ? (
                    <div className="flex items-end gap-2">
                      <label className="flex flex-1 flex-col gap-1 text-xs">
                        <span className="font-medium text-gray-700 dark:text-gray-200">{t("changeOrderId")}</span>
                        <input required className="input py-1 text-xs" value={changeOrderId} onChange={(e) => setChangeOrderId(e.target.value)} />
                      </label>
                      <button onClick={() => convert(r.id)} disabled={busy || !changeOrderId} className="btn-primary px-2.5 py-1 text-xs">
                        {tc("save")}
                      </button>
                      <button onClick={() => setConvertingId(null)} className="btn-secondary px-2.5 py-1 text-xs">
                        {tc("cancel")}
                      </button>
                    </div>
                  ) : decliningId === r.id ? (
                    <div className="flex items-end gap-2">
                      <label className="flex flex-1 flex-col gap-1 text-xs">
                        <span className="font-medium text-gray-700 dark:text-gray-200">{t("declineNoteLabel")}</span>
                        <input required className="input py-1 text-xs" value={declineNote} onChange={(e) => setDeclineNote(e.target.value)} />
                      </label>
                      <button onClick={() => decline(r.id)} disabled={busy || !declineNote} className="btn-primary px-2.5 py-1 text-xs">
                        {tc("save")}
                      </button>
                      <button onClick={() => setDecliningId(null)} className="btn-secondary px-2.5 py-1 text-xs">
                        {tc("cancel")}
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <button onClick={() => setConvertingId(r.id)} className="btn-primary px-2.5 py-1 text-xs">
                        {t("convert")}
                      </button>
                      <button onClick={() => setDecliningId(r.id)} className="btn-secondary px-2.5 py-1 text-xs">
                        {t("decline")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
