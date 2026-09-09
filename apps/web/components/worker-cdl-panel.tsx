"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api-client";

export function WorkerCdlPanel({ workerId }: { workerId: string }) {
  const t = useTranslations("team");
  const tc = useTranslations("common");

  const [cdlExpiresAt, setCdlExpiresAt] = useState("");
  const [cdlBusy, setCdlBusy] = useState(false);
  const [cdlMessage, setCdlMessage] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    apiFetch<{ worker: { cdlExpiresAt: string | null } }>(`/workers/${workerId}/summary`).then(({ worker }) =>
      setCdlExpiresAt(worker.cdlExpiresAt ? worker.cdlExpiresAt.slice(0, 10) : ""),
    );
  }, [workerId]);

  async function saveCdlExpiry(e: React.FormEvent) {
    e.preventDefault();
    setCdlBusy(true);
    setCdlMessage(null);
    try {
      await apiFetch(`/workers/${workerId}/cdl`, {
        method: "PATCH",
        body: JSON.stringify({ cdlExpiresAt: cdlExpiresAt ? new Date(cdlExpiresAt).toISOString() : null }),
      });
      setCdlMessage({ error: false, text: tc("saved") });
    } catch (err) {
      setCdlMessage({ error: true, text: err instanceof ApiError ? err.message : tc("error") });
    } finally {
      setCdlBusy(false);
    }
  }

  return (
    <>
      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("cdlExpiry")}</h2>
      <form onSubmit={saveCdlExpiry} className="flex items-center gap-2">
        <input type="date" className="input flex-1" value={cdlExpiresAt} onChange={(e) => setCdlExpiresAt(e.target.value)} />
        <button type="submit" disabled={cdlBusy} className="btn-secondary shrink-0">
          {tc("save")}
        </button>
      </form>
      {cdlMessage && <p className={`mt-1.5 text-xs ${cdlMessage.error ? "text-error-700 dark:text-error-500" : "text-success-700 dark:text-success-500"}`}>{cdlMessage.text}</p>}
    </>
  );
}
