"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ProgressBillingPanel } from "@/components/progress-billing-panel";
import { EstimateSuggestionsPanel } from "@/components/estimate-suggestions-panel";
import { AssemblyQuickAddPanel } from "@/components/assembly-quick-add-panel";
import { EstimateAlternatesPanel } from "@/components/estimate-alternates-panel";
import { EstimateRevisionHistoryPanel } from "@/components/estimate-revision-history-panel";
import { EstimateVariantsPanel } from "@/components/estimate-variants-panel";
import { EstimateChangeOrdersPanel } from "@/components/estimate-change-orders-panel";
import type { CostCode } from "@/components/cost-codes-panel";
import { apiFetch, downloadBlob, notifyApiError } from "@/lib/api-client";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchClientLink } from "@/lib/client-link";
import { useCan } from "@/lib/permissions";
import { useMe } from "@/lib/use-me";
import { formatDateTime } from "@/lib/format-date";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatCurrency } from "@/lib/format-currency";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/status-tone";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";

interface RateCatalogItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  formula: string | null;
  formulaParams: string[];
}
interface EstimateLine {
  id: string;
  rateCatalogItemId: string;
  quantity: string;
  materialsCost: string;
  laborCost: string;
  lineTotal: string;
}
interface LineBenchmark {
  estimateLineId: string;
  benchmarkMedian: number;
  benchmarkSampleSize: number;
  deviationPercent: number;
}
const BENCHMARK_FLAG_THRESHOLD = 15;
interface Requirement {
  id: string;
  quantity: string;
  unit: string;
  materialCatalogItem: { name: string; code: string };
}
interface Warehouse {
  id: string;
  name: string;
}
interface IssueReportLine {
  materialCatalogItemId: string;
  name: string;
  required: number;
  remainingStock: number;
}
type ClientDecision = "pending" | "approved" | "rejected" | "countered";
type EstimateStatus = "draft" | "pending_approval" | "approved";
interface EstimateApproval {
  id: string;
  userId: string;
  actorName: string;
  approvedAt: string;
}
interface Estimate {
  id: string;
  name: string;
  status: EstimateStatus;
  laborRatePerHour: string;
  markupPercent: string;
  taxPercent: string;
  materialsCostTotal: string;
  laborCostTotal: string;
  subtotal: string;
  markupAmount: string;
  taxAmount: string;
  grandTotal: string;
  currency: string;
  currentVersion: number;
  isStale: boolean;
  lines: EstimateLine[];
  requirements: Requirement[];
  project: { id: string; name: string };
  clientDecision: ClientDecision;
  sentAt: string | null;
  decisionAt: string | null;
  clientDecisionNote: string | null;
  counterOfferAmount: string | null;
  variantOfId: string | null;
  variantLabel: string | null;
  coverLetter: string | null;
  signerName: string | null;
  approvals: EstimateApproval[];
}
export function EstimateDetail({ estimateId }: { estimateId: string }) {
  const t = useTranslations("estimates");
  const confirm = useConfirm();
  const tc = useTranslations("common");
  const router = useRouter();
  const { data: me } = useMe();

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [rateItems, setRateItems] = useState<RateCatalogItem[]>([]);
  const [newLine, setNewLine] = useState({ rateCatalogItemId: "", quantity: "1", costCodeId: "" });
  const [formulaValues, setFormulaValues] = useState<Record<string, string>>({});
  const [formulaResult, setFormulaResult] = useState<{ value: number | null; error: string | null }>({ value: null, error: null });
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [busy, setBusy] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [issueWarehouseId, setIssueWarehouseId] = useState("");
  const [issueReport, setIssueReport] = useState<IssueReportLine[] | null>(null);

  const [templateName, setTemplateName] = useState("");
  const [templateSaved, setTemplateSaved] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  /** Fetched on the first copy — list/get responses don't carry the client's token. */
  const [clientLink, setClientLink] = useState<string | null>(null);
  const can = useCan();
  const [emailSentTo, setEmailSentTo] = useState<string | null | undefined>(undefined);

  const [estimateSignatureUrl, setEstimateSignatureUrl] = useState<string | null>(null);

  const [coverLetterDraft, setCoverLetterDraft] = useState("");
  const [savingCoverLetter, setSavingCoverLetter] = useState(false);

  const [benchmarks, setBenchmarks] = useState<Record<string, LineBenchmark>>({});

  function load() {
    apiFetch<Estimate>(`/estimates/${estimateId}`)
      .then((e) => {
        setLoadError(null);
        setEstimate(e);
        setCoverLetterDraft(e.coverLetter ?? "");
        if (e.clientDecision === "approved" && e.signerName) {
          apiFetch<Blob>(`/estimates/${estimateId}/signature`)
            .then((blob) => setEstimateSignatureUrl(URL.createObjectURL(blob)))
            .catch(() => setEstimateSignatureUrl(null));
        }
      })
      .catch(setLoadError);
  }

  async function saveCoverLetter() {
    setSavingCoverLetter(true);
    try {
      await apiFetch(`/estimates/${estimateId}/cover-letter`, {
        method: "PATCH",
        body: JSON.stringify({ coverLetter: coverLetterDraft || null }),
      });
      load();
    } finally {
      setSavingCoverLetter(false);
    }
  }

  /** Cost benchmarks are a costing figure — only for members who may see costs (costing.view). */
  const seesCosts = can("costing.view");
  function loadBenchmarks() {
    if (!seesCosts) return;
    apiFetch<LineBenchmark[]>(`/estimate-accuracy/cost-benchmarks/${estimateId}`)
      .then((list) => setBenchmarks(Object.fromEntries(list.map((b) => [b.estimateLineId, b]))))
      .catch(() => setBenchmarks({}));
  }

  useEffect(() => {
    load();
    loadBenchmarks();
    apiFetch<RateCatalogItem[]>("/estimates/rate-catalog")
      .then((items) => {
        setRateItems(items);
        if (items[0]) setNewLine((l) => ({ ...l, rateCatalogItemId: items[0].id }));
      })
      .catch(notifyApiError);
    apiFetch<Warehouse[]>("/materials/warehouses")
      .then((list) => {
        setWarehouses(list);
        if (list[0]) setIssueWarehouseId(list[0].id);
      })
      .catch(notifyApiError);
    apiFetch<CostCode[]>("/cost-codes").then(setCostCodes).catch(notifyApiError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateId]);

  const [revisionRefreshSignal, setRevisionRefreshSignal] = useState(0);

  const rateItemsById = Object.fromEntries(rateItems.map((r) => [r.id, r]));
  const currency = estimate?.currency ?? me?.company.currency ?? "";

  const selectedRateItem = rateItemsById[newLine.rateCatalogItemId];

  async function computeFormula() {
    if (!selectedRateItem?.formula) return;
    setFormulaResult({ value: null, error: null });
    try {
      const variables = Object.fromEntries(selectedRateItem.formulaParams.map((p) => [p, Number(formulaValues[p] ?? 0)]));
      const result = await apiFetch<{ value: number }>(`/estimates/rate-catalog/${selectedRateItem.id}/evaluate-formula`, {
        method: "POST",
        body: JSON.stringify({ variables }),
      });
      setFormulaResult({ value: result.value, error: null });
    } catch (err) {
      setFormulaResult({ value: null, error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function addLine(e: React.FormEvent) {
    e.preventDefault();
    const quantity = selectedRateItem?.formula ? formulaResult.value : Number(newLine.quantity);
    if (quantity === null || quantity === undefined || Number.isNaN(quantity)) return;
    setBusy(true);
    try {
      await apiFetch(`/estimates/${estimateId}/lines`, {
        method: "POST",
        body: JSON.stringify({
          rateCatalogItemId: newLine.rateCatalogItemId,
          quantity,
          costCodeId: newLine.costCodeId || undefined,
        }),
      });
      setFormulaValues({});
      setFormulaResult({ value: null, error: null });
      load();
      loadBenchmarks();
    } finally {
      setBusy(false);
    }
  }

  async function recalculate() {
    setBusy(true);
    try {
      await apiFetch(`/estimates/${estimateId}/recalculate`, { method: "POST" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    try {
      await apiFetch(`/estimates/${estimateId}/approve`, { method: "POST" });
      load();
      setRevisionRefreshSignal((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setLinkCopied(false);
    setClientLink(null);
    try {
      const result = await apiFetch<{ emailSentTo: string | null }>(`/estimates/${estimateId}/send`, { method: "POST" });
      setEmailSentTo(result.emailSentTo);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    const link = clientLink ?? (await fetchClientLink(`/estimates/${estimateId}/client-link`, "estimate"));
    setClientLink(link);
    await navigator.clipboard.writeText(link);
    setLinkCopied(true);
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

  async function createRevisedVariant() {
    setBusy(true);
    try {
      const created = await apiFetch<{ id: string }>(`/estimates/${estimateId}/create-variant`, {
        method: "POST",
        body: JSON.stringify({ label: t("revisedVariantLabel") }),
      });
      router.push(`/estimates/${created.id}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveAsTemplate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setTemplateSaved(false);
    try {
      await apiFetch(`/estimates/${estimateId}/save-as-template`, {
        method: "POST",
        body: JSON.stringify({ name: templateName }),
      });
      setTemplateName("");
      setTemplateSaved(true);
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    const blob = await apiFetch<Blob>(`/estimates/${estimateId}/pdf`);
    downloadBlob(blob, `${estimate?.name ?? "estimate"}.pdf`);
  }

  async function issueStock() {
    if (!issueWarehouseId) return;
    setBusy(true);
    try {
      const report = await apiFetch<{ lines: IssueReportLine[] }>("/materials/stock/issue-from-estimate", {
        method: "POST",
        body: JSON.stringify({ estimateId, warehouseId: issueWarehouseId }),
      });
      setIssueReport(report.lines);
    } finally {
      setBusy(false);
    }
  }

  async function generateInvoice() {
    setBusy(true);
    try {
      const invoice = await apiFetch<{ id: string }>("/invoices/from-estimate", {
        method: "POST",
        body: JSON.stringify({ estimateId }),
      });
      router.push(`/invoices/${invoice.id}`);
    } finally {
      setBusy(false);
    }
  }

  if (!estimate) {
    return loadError ? <ErrorState error={loadError} onRetry={load} backHref="/estimates" /> : <Skeleton variant="block" height="h-64" />;
  }

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
      {estimate.status === "pending_approval" && me?.company.requiredApprovalCount && (
        <Alert tone="warning" className="mt-2">
          <p className="text-sm text-warning-fg">
            {t("approvalProgress", { count: estimate.approvals.length, required: me.company.requiredApprovalCount })}
          </p>
          <p className="mt-1 text-xs text-warning-fg">
            {estimate.approvals.map((a) => a.actorName).join(", ")}
          </p>
        </Alert>
      )}
      {estimate.clientDecision === "rejected" && estimate.clientDecisionNote && (
        <p className="mt-2 text-sm text-danger-fg">
          {t("clientNote")}: {estimate.clientDecisionNote}
        </p>
      )}
      {estimate.clientDecision === "countered" && (
        <Alert tone="brand" className="mt-2">
          <p className="text-sm font-medium text-brand-700 dark:text-brand-400">
            {t("counterOfferReceived", { amount: formatCurrency(estimate.counterOfferAmount, estimate.currency) })}
          </p>
          {estimate.clientDecisionNote && <p className="mt-1 text-sm text-brand-700 dark:text-brand-400">{estimate.clientDecisionNote}</p>}
          <button onClick={createRevisedVariant} disabled={busy} className="btn-secondary mt-2 px-3 py-1 text-xs">
            {t("createRevisedVariant")}
          </button>
        </Alert>
      )}
      {estimate.clientDecision === "approved" && estimate.signerName && (
        <div className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          {estimateSignatureUrl && (
            <img src={estimateSignatureUrl} alt={t("signature")} className="h-8 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-1" />
          )}
          <span>
            {t("signedBy", { name: estimate.signerName })}
            {estimate.decisionAt && ` · ${formatDateTime(new Date(estimate.decisionAt))}`}
          </span>
        </div>
      )}

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
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                <th className="py-2">{t("rateItem")}</th>
                <th>{t("quantity")}</th>
                <th>{t("materialsCost")}</th>
                <th>{t("laborCost")}</th>
                <th>{t("lineTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {estimate.lines.map((line) => (
                <tr key={line.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">{rateItemsById[line.rateCatalogItemId]?.name ?? line.rateCatalogItemId}</td>
                  <td>
                    {line.quantity} {rateItemsById[line.rateCatalogItemId]?.unit}
                  </td>
                  <td>
                    {formatCurrency(line.materialsCost, currency)}
                  </td>
                  <td>
                    {formatCurrency(line.laborCost, currency)}
                  </td>
                  <td className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>
                        {formatCurrency(line.lineTotal, currency)}
                      </span>
                      {benchmarks[line.id] && Math.abs(benchmarks[line.id].deviationPercent) >= BENCHMARK_FLAG_THRESHOLD && (
                        <Badge
                          tone={benchmarks[line.id].deviationPercent > 0 ? "warning" : "success"}
                          className="shrink-0"
                          title={t("benchmarkHint", {
                            median: formatCurrency(benchmarks[line.id].benchmarkMedian, currency),
                            count: benchmarks[line.id].benchmarkSampleSize,
                          })}
                        >
                          {benchmarks[line.id].deviationPercent > 0 ? "+" : ""}
                          {benchmarks[line.id].deviationPercent}%
                        </Badge>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {estimate.status === "draft" && (
            <form onSubmit={addLine} className="mt-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-end gap-2">
                <select
                  className="input"
                  value={newLine.rateCatalogItemId}
                  onChange={(e) => {
                    setNewLine((l) => ({ ...l, rateCatalogItemId: e.target.value }));
                    setFormulaValues({});
                    setFormulaResult({ value: null, error: null });
                  }}
                >
                  {rateItems.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.unit})
                      {r.formula ? " ƒ" : ""}
                    </option>
                  ))}
                </select>
                {!selectedRateItem?.formula && (
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="input w-28"
                    value={newLine.quantity}
                    onChange={(e) => setNewLine((l) => ({ ...l, quantity: e.target.value }))}
                  />
                )}
                {costCodes.length > 0 && (
                  <select
                    className="input w-auto"
                    value={newLine.costCodeId}
                    onChange={(e) => setNewLine((l) => ({ ...l, costCodeId: e.target.value }))}
                  >
                    <option value="">{t("costCodeUnassigned")}</option>
                    {costCodes.map((cc) => (
                      <option key={cc.id} value={cc.id}>
                        {cc.code} {cc.name}
                      </option>
                    ))}
                  </select>
                )}
                <button type="submit" disabled={busy || (!!selectedRateItem?.formula && formulaResult.value === null)} className="btn-secondary">
                  {t("addLine")}
                </button>
              </div>

              {selectedRateItem?.formula && (
                <div className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-100 dark:border-gray-700 p-3">
                  <span className="font-mono text-xs text-fg-subtle">{selectedRateItem.formula}</span>
                  {selectedRateItem.formulaParams.map((param) => (
                    <label key={param} className="flex flex-col gap-1 text-xs text-fg-subtle">
                      {param}
                      <input
                        type="number"
                        step="any"
                        className="input w-24"
                        value={formulaValues[param] ?? ""}
                        onChange={(e) => setFormulaValues((v) => ({ ...v, [param]: e.target.value }))}
                      />
                    </label>
                  ))}
                  <button type="button" onClick={computeFormula} className="btn-secondary px-3 py-1 text-xs">
                    {t("computeFormula")}
                  </button>
                  {formulaResult.value !== null && (
                    <span className="text-xs font-medium text-success-fg">
                      {t("computedQuantity", { value: formulaResult.value, unit: selectedRateItem.unit })}
                    </span>
                  )}
                  {formulaResult.error && <span className="text-xs text-danger-fg">{formulaResult.error}</span>}
                </div>
              )}
            </form>
          )}

          {estimate.status === "draft" && <AssemblyQuickAddPanel estimateId={estimateId} onAdded={load} />}

          {estimate.status === "draft" && <EstimateSuggestionsPanel estimateId={estimateId} onAdded={load} />}

          {estimate.status === "approved" && (
            <div className="mt-8">
              <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("materialRequirements")}</h2>
              <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {estimate.requirements.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="py-2">{r.materialCatalogItem.name}</td>
                      <td className="text-right">
                        {r.quantity} {r.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              {warehouses.length > 0 && (
                <div className="mt-4 flex items-end gap-2">
                  <select className="input w-auto" value={issueWarehouseId} onChange={(e) => setIssueWarehouseId(e.target.value)}>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                  <button onClick={issueStock} disabled={busy} className="btn-secondary">
                    {t("issueStock")}
                  </button>
                </div>
              )}

              {issueReport && (
                <div className="mt-4">
                  <h3 className="mb-2 text-xs font-semibold text-fg-subtle">{t("issueReport")}</h3>
                  <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                        <th className="py-1"></th>
                        <th>{t("required")}</th>
                        <th>{t("remainingStock")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {issueReport.map((r) => (
                        <tr key={r.materialCatalogItemId} className="border-b border-gray-100 dark:border-gray-700">
                          <td className="py-1">{r.name}</td>
                          <td>{r.required}</td>
                          <td className={r.remainingStock < 0 ? "text-danger-fg" : ""}>{r.remainingStock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>
          )}

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

        <div className="card lg:col-span-1 h-fit">
          <dl className="flex flex-col gap-2 text-sm">
            <Row label={t("materialsCost")} value={`${formatCurrency(estimate.materialsCostTotal, currency)}`} />
            <Row label={t("laborCost")} value={`${formatCurrency(estimate.laborCostTotal, currency)}`} />
            <Row label={t("subtotal")} value={`${formatCurrency(estimate.subtotal, currency)}`} />
            <Row label={`${t("markupAmount")} (${estimate.markupPercent}%)`} value={`${formatCurrency(estimate.markupAmount, currency)}`} />
            <Row label={`${t("taxAmount")} (${estimate.taxPercent}%)`} value={`${formatCurrency(estimate.taxAmount, currency)}`} />
            <Row label={t("grandTotal")} value={`${formatCurrency(estimate.grandTotal, currency)}`} emphasize />
          </dl>

          <div className="mt-6 flex flex-col gap-2">
            {estimate.status === "draft" && (
              <button onClick={approve} disabled={busy || estimate.lines.length === 0} className="btn-primary">
                {t("approve")}
              </button>
            )}
            {estimate.status === "pending_approval" &&
              (estimate.approvals.some((a) => a.userId === me?.user.id) ? (
                <p className="text-xs text-fg-subtle">{t("alreadyApprovedByYou")}</p>
              ) : (
                <button onClick={approve} disabled={busy} className="btn-primary">
                  {t("approveStep")}
                </button>
              ))}
            {estimate.status === "approved" && (
              <button onClick={generateInvoice} disabled={busy} className="btn-primary">
                {t("generateInvoice")}
              </button>
            )}
            {estimate.status === "approved" && (
              <button onClick={send} disabled={busy} className="btn-secondary">
                {estimate.sentAt ? t("resend") : t("sendToClient")}
              </button>
            )}
            <button onClick={downloadPdf} className="btn-secondary">
              {t("downloadPdf")}
            </button>
            {estimate.status === "draft" && <p className="text-xs text-fg-subtle">{t("approveFirst")}</p>}
          </div>

          {estimate.status === "draft" && (
            <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4">
              <label className="text-xs font-medium text-fg-subtle">{t("coverLetter")}</label>
              <textarea
                className="input mt-2 w-full"
                rows={4}
                placeholder={t("coverLetterPlaceholder")}
                value={coverLetterDraft}
                onChange={(e) => setCoverLetterDraft(e.target.value)}
              />
              <button
                onClick={saveCoverLetter}
                disabled={savingCoverLetter || coverLetterDraft === (estimate.coverLetter ?? "")}
                className="btn-secondary mt-2 px-3 py-1 text-xs"
              >
                {tc("save")}
              </button>
            </div>
          )}

          {estimate.status === "approved" && <ProgressBillingPanel estimateId={estimateId} currency={currency} />}

          {estimate.sentAt && can("estimates.manage") && (
            <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4">
              <span className="text-xs font-medium text-fg-subtle">{t("clientLink")}</span>
              <div className="mt-2 flex items-center gap-2">
                {clientLink && <input readOnly className="input flex-1 text-xs" value={clientLink} />}
                <button onClick={copyLink} className="btn-secondary shrink-0 px-3 py-1 text-xs">
                  {linkCopied ? tc("saved") : t("copyLink")}
                </button>
              </div>
              {emailSentTo !== undefined && (
                <p className="mt-2 text-xs text-fg-subtle">
                  {emailSentTo ? tc("emailedTo", { email: emailSentTo }) : tc("noClientEmail")}
                </p>
              )}
            </div>
          )}

          <form onSubmit={saveAsTemplate} className="mt-6 flex flex-col gap-2 border-t border-gray-100 dark:border-gray-700 pt-4">
            <span className="text-xs font-medium text-fg-subtle">{t("saveAsTemplate")}</span>
            <input
              required
              placeholder={t("templateName")}
              className="input"
              value={templateName}
              onChange={(e) => {
                setTemplateName(e.target.value);
                setTemplateSaved(false);
              }}
            />
            <button type="submit" disabled={busy} className="btn-secondary">
              {t("saveAsTemplate")}
            </button>
            {templateSaved && <p className="text-xs text-success-fg">{tc("saved")}</p>}
          </form>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className={`flex justify-between ${emphasize ? "border-t border-gray-200 dark:border-gray-700 pt-2 font-semibold" : ""}`}>
      <dt className="text-fg-subtle">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
