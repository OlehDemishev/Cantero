"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { unsentForOtherAccounts, type WaitingElsewhere } from "@/lib/offline-db";

/**
 * On a shared tablet: tells whoever is signed in that a colleague's offline entries are still on
 * the device, waiting for that colleague — so nobody wipes the browser thinking it's empty, and the
 * colleague knows to sign in once there's a connection.
 */
export function OfflineOthersNotice() {
  const t = useTranslations("field");
  const [waiting, setWaiting] = useState<WaitingElsewhere[]>([]);

  useEffect(() => {
    let cancelled = false;
    unsentForOtherAccounts()
      .then((w) => !cancelled && setWaiting(w))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (waiting.length === 0) return null;
  return (
    <div role="status" className="mb-4 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/15 dark:text-warning-500">
      {waiting.map((w) => (
        <p key={w.accountKey}>{t("unsentForOthers", { name: w.companyName ? `${w.name} (${w.companyName})` : w.name, count: w.count })}</p>
      ))}
    </div>
  );
}
