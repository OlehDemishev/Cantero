"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useApi } from "@/lib/use-api";

interface Company {
  referralCode: string | null;
}
interface ReferralStats {
  referredCount: number;
}

export function ReferralProgramPanel() {
  const t = useTranslations("referrals");
  const ta = useTranslations("a11y");
  const { data: company = null } = useApi<Company>("/company");
  const { data: stats = null } = useApi<ReferralStats>("/company/referral");
  const [copied, setCopied] = useState(false);

  if (!company?.referralCode) return null;

  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/signup?ref=${company.referralCode}`;

  function copyLink() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="card">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <p className="mb-4 text-xs text-fg-subtle">{t("hint")}</p>

      <div className="flex items-center gap-2">
        <input aria-label={ta("shareLink")} readOnly className="input flex-1 text-xs" value={link} />
        <button onClick={copyLink} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
          {copied ? t("copied") : t("copyLink")}
        </button>
      </div>

      {stats && <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{t("referredCount", { count: stats.referredCount })}</p>}
    </section>
  );
}
