"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SubcontractorPrequalificationPanel } from "@/components/subcontractor-prequalification-panel";
import { formatDate } from "@/lib/format-date";
import { useApi } from "@/lib/use-api";
import { Badge } from "@/components/ui/badge";
import type { Compliance, Subcontractor } from "@/components/subcontractor-list-item/types";
import { useReloadOnVersion } from "@/components/subcontractor-list-item/use-reload-on-version";
import { DocumentsSection } from "@/components/subcontractor-list-item/documents-section";
import { AssignmentsSection } from "@/components/subcontractor-list-item/assignments-section";
import { CostsSection } from "@/components/subcontractor-list-item/costs-section";
import { ProfileSection } from "@/components/subcontractor-list-item/profile-section";
import { DiversitySection } from "@/components/subcontractor-list-item/diversity-section";
import { ScorecardSection } from "@/components/subcontractor-list-item/scorecard-section";
import { TaxPaymentsSection } from "@/components/subcontractor-list-item/tax-payments-section";

/** One subcontractor's expandable card: compliance, documents, prequalification profile,
 * diversity certs, performance scorecard, and (US only) tax profile + 1099 payment log. Fetches
 * its own detail data on first expand and manages every field independently — the parent only
 * needs the row's own fields (name/email) and an `onChanged` nudge after a save that could affect
 * how the row looks the next time the list reloads. Each section of the opened row
 * (components/subcontractor-list-item/*) loads and saves its own part; the row shares one busy
 * flag and reloads every section after a change. */
export function SubcontractorListItem({
  subcontractor: s,
  isUsCompany,
  onChanged,
}: {
  subcontractor: Subcontractor;
  isUsCompany: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("subcontractorCompliance");

  const [expanded, setExpanded] = useState(false);
  // The details below are loaded once the row is opened.
  const { data: compliance = null, reload: reloadCompliance } = useApi<Compliance>(
    expanded ? `/finance/subcontractors/${s.id}/compliance` : null,
  );
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  useReloadOnVersion(version, reloadCompliance);

  const sectionProps = { subcontractor: s, busy, setBusy, version, refresh: () => setVersion((v) => v + 1), onChanged };

  return (
    <li className="card">
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-between text-left">
        <div>
          <span className="text-sm font-medium text-fg">{s.name}</span>
          {s.email && <span className="ml-2 text-xs text-fg-subtle">{s.email}</span>}
        </div>
        {expanded && compliance && (
          <Badge tone={compliance.compliant ? "success" : "danger"}>
            {compliance.compliant ? t("compliant") : t("nonCompliant")}
          </Badge>
        )}
      </button>

      {expanded && (
        <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 dark:border-gray-700 pt-3">
          {compliance && (
            <ul className="flex flex-col gap-1">
              {compliance.requirements.map((r) => (
                <li key={r.type} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-gray-300">{t(r.type)}</span>
                  <span
                    className={
                      r.status === "valid"
                        ? "text-success-fg"
                        : r.status === "expired"
                          ? "text-danger-fg"
                          : "text-fg-subtle"
                    }
                  >
                    {r.status === "valid" && r.expiresAt
                      ? t("validUntil", { date: formatDate(new Date(r.expiresAt)) })
                      : r.status === "expired" && r.expiresAt
                        ? t("expiredOn", { date: formatDate(new Date(r.expiresAt)) })
                        : t("missing")}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <DocumentsSection {...sectionProps} />
          <AssignmentsSection {...sectionProps} />
          <CostsSection {...sectionProps} />
          <ProfileSection {...sectionProps} />
          <DiversitySection {...sectionProps} />

          <SubcontractorPrequalificationPanel subcontractorId={s.id} />

          <ScorecardSection {...sectionProps} />
          <TaxPaymentsSection {...sectionProps} isUsCompany={isUsCompany} />
        </div>
      )}
    </li>
  );
}
