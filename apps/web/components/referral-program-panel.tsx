"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface Company {
  referralCode: string | null;
}
interface ReferralStats {
  referredCount: number;
}

export function ReferralProgramPanel() {
  const t = useTranslations("referrals");
  const [company, setCompany] = useState<Company | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch<Company>("/company").then(setCompany);
    apiFetch<ReferralStats>("/company/referral").then(setStats);
  }, []);

  if (!company?.referralCode) return null;

  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/signup?ref=${company.referralCode}`;

  function copyLink() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="card">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-4 text-xs text-gray-500">{t("hint")}</p>

      <div className="flex items-center gap-2">
        <input readOnly className="input flex-1 text-xs" value={link} />
        <button onClick={copyLink} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
          {copied ? t("copied") : t("copyLink")}
        </button>
      </div>

      {stats && <p className="mt-3 text-sm text-gray-600">{t("referredCount", { count: stats.referredCount })}</p>}
    </section>
  );
}
