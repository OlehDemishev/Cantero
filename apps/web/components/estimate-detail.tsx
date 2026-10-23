"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { EstimateSuggestionsPanel } from "@/components/estimate-suggestions-panel";
import { AssemblyQuickAddPanel } from "@/components/assembly-quick-add-panel";
import { EstimateAlternatesPanel } from "@/components/estimate-alternates-panel";
import { EstimateRevisionHistoryPanel } from "@/components/estimate-revision-history-panel";
import { EstimateVariantsPanel } from "@/components/estimate-variants-panel";
import { EstimateChangeOrdersPanel } from "@/components/estimate-change-orders-panel";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/lib/use-me";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/status-tone";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import type { Estimate, RateCatalogItem } from "@/components/estimate-detail/types";
import { StatusNotices } from "@/components/estimate-detail/status-notices";
import { LinesSection } from "@/components/estimate-detail/lines-section";
import { MaterialRequirements } from "@/components/estimate-detail/material-requirements";
import { SummarySidebar } from "@/components/estimate-detail/summary-sidebar";

/**
 * One estimate. The page loads the estimate and the rate catalog; its sections
 * (components/estimate-detail/*) own their forms and extra data and share one busy flag.
 */
export function EstimateDetail({ estimateId }: { estimateId: string }) {
  const t = useTranslations("estimates");
  const confirm = useConfirm();
  const { data: me } = useMe();

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [rateItems, setRateItems] = useState<RateCatalogItem[]>([]);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Estimate>(`/estimates/${estimateId}`)
      .then((e) => {
        setLoadError(null);
        setEstimate(e);
      })
      .catch(setLoadError);
  }

  useEffect(() => {
    load();
    apiFetch<RateCatalogItem[]>("/estimates/rate-catalog").then(setRateItems).catch(notifyApiError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateId]);

  const [revisionRefreshSignal, setRevisionRefreshSignal] = useState(0);

  const rateItemsById = Object.fromEntries(rateItems.map((r) => [r.id, r]));
  const currency = estimate?.currency ?? me?.company.currency ?? "";

  async function recalculate() {
    setBusy(true);
    try {
      await apiFetch(`/estimates/${estimateId}/recalculate`, { method: "POST" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function declineOnBehalfOfClient() {
    await confirm({
      title: t("declineOnBehalfOfClient"),
      tone: "danger",
      verb: "decline",
      reason: { label: t("declineOnBehalfNotePrompt"), required: true },
      action: async (note) => {
        await apiFetch(`/estimates/${estimateId}/decline`, { method: "POST", body: JSON.stringify({ note }) });
        load();
      },
    });
  }

  if (!estimate) {
    return loadError ? <ErrorState error={loadError} onRetry={load} backHref="/estimates" /> : <Skeleton variant="block" height="h-64" />;
  }

  const sectionProps = { estimateId, estimate, currency, busy, setBusy, reload: load };

  return (
    <>
      <PageHeader
        back={{ href: `/projects/${estimate.project.id}`, label: estimate.project.name }}
        title={
          <>
            {estimate.name}
            {estimate.variantLabel && (
              <Badge tone="brand" className="ml-2 align-middle">
                {estimate.variantLabel}
              </Badge>
            )}
          </>
        }
        actions={
          <>
            {estimate.sentAt && (
              <Badge tone={estimate.clientDecision === "approved" ? "success" : estimate.clientDecision === "rejected" ? "danger" : estimate.clientDecision === "countered" ? "brand" : "warning"}>
                {t(`clientDecision_${estimate.clientDecision}`)}
              </Badge>
            )}
            <Badge tone={statusTone(estimate.status)}>
              {estimate.status === "approved" ? t("approved") : estimate.status === "pending_approval" ? t("pendingApproval") : t("draft")}
            </Badge>
            {estimate.sentAt && estimate.clientDecision === "pending" && (
              <button onClick={declineOnBehalfOfClient} disabled={busy} className="btn-secondary px-3 py-1 text-xs">
                {t("declineOnBehalfOfClient")}
              </button>
            )}
          </>
        }
      />
      <StatusNotices {...sectionProps} />

      {estimate.status === "draft" && estimate.isStale && (
        <Alert
          tone="warning"
          className="mt-4"
          action={
            <button onClick={recalculate} disabled={busy} className="btn-secondary">
              {t("recalculate")}
            </button>
          }
        >
          {t("pricesChanged")}
        </Alert>
      )}

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LinesSection {...sectionProps} rateItems={rateItems} />

          {estimate.status === "draft" && <AssemblyQuickAddPanel estimateId={estimateId} onAdded={load} />}

          {estimate.status === "draft" && <EstimateSuggestionsPanel estimateId={estimateId} onAdded={load} />}

          {estimate.status === "approved" && <MaterialRequirements {...sectionProps} />}

          <EstimateRevisionHistoryPanel
            estimateId={estimateId}
            currentLines={estimate.lines}
            rateItemsById={rateItemsById}
            currency={currency}
            refreshSignal={revisionRefreshSignal}
          />

          <EstimateVariantsPanel estimateId={estimateId} currency={currency} />

          <EstimateAlternatesPanel estimateId={estimateId} currency={currency} />

          {estimate.status === "approved" && (
            <EstimateChangeOrdersPanel estimateId={estimateId} rateItems={rateItems} currency={currency} />
          )}
        </div>

        <SummarySidebar {...sectionProps} onApproved={() => setRevisionRefreshSignal((n) => n + 1)} />
      </div>
    </>
  );
}
