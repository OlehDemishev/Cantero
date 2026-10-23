"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { unsentForOtherAccounts, type WaitingElsewhere } from "@/lib/offline-db";
import { Alert } from "@/components/ui/alert";

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
    <Alert tone="warning" className="mb-4" role="status">
      {waiting.map((w) => (
        <p key={w.accountKey}>{t("unsentForOthers", { name: w.companyName ? `${w.name} (${w.companyName})` : w.name, count: w.count })}</p>
      ))}
    </Alert>
  );
}
