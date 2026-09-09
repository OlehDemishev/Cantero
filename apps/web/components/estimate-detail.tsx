"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { ProgressBillingPanel } from "@/components/progress-billing-panel";
import { EstimateSuggestionsPanel } from "@/components/estimate-suggestions-panel";
import { AssemblyQuickAddPanel } from "@/components/assembly-quick-add-panel";
import { EstimateAlternatesPanel } from "@/components/estimate-alternates-panel";
import { EstimateRevisionHistoryPanel } from "@/components/estimate-revision-history-panel";
import { EstimateVariantsPanel } from "@/components/estimate-variants-panel";
import { EstimateChangeOrdersPanel } from "@/components/estimate-change-orders-panel";
import type { CostCode } from "@/components/cost-codes-panel";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatDateTime } from "@/lib/format-date";

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
  clientAccessToken: string | null;
  variantOfId: string | null;
  variantLabel: string | null;
  coverLetter: string | null;
  signerName: string | null;
  approvals: EstimateApproval[];
}
export function EstimateDetail({ estimateId }: { estimateId: string }) {
  const t = useTranslations("estimates");
  const tc = useTranslations("common");
  const router = useRouter();
  const { data: me } = useMe();

  const [estimate, setEstimate] = useState<Estimate | null>(null);
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
  const [emailSentTo, setEmailSentTo] = useState<string | null | undefined>(undefined);

  const [estimateSignatureUrl, setEstimateSignatureUrl] = useState<string | null>(null);

  const [coverLetterDraft, setCoverLetterDraft] = useState("");
  const [savingCoverLetter, setSavingCoverLetter] = useState(false);

  const [benchmarks, setBenchmarks] = useState<Record<string, LineBenchmark>>({});

  function load() {
    apiFetch<Estimate>(`/estimates/${estimateId}`).then((e) => {
      setEstimate(e);
      setCoverLetterDraft(e.coverLetter ?? "");
      if (e.clientDecision === "approved" && e.signerName) {
        apiFetch<Blob>(`/estimates/${estimateId}/signature`).then((blob) => setEstimateSignatureUrl(URL.createObjectURL(blob)));
      }
    });
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

  function loadBenchmarks() {
    apiFetch<LineBenchmark[]>(`/estimate-accuracy/cost-benchmarks/${estimateId}`).then((list) =>
      setBenchmarks(Object.fromEntries(list.map((b) => [b.estimateLineId, b]))),
    );
  }

  useEffect(() => {
    load();
    loadBenchmarks();
    apiFetch<RateCatalogItem[]>("/estimates/rate-catalog").then((items) => {
      setRateItems(items);
      if (items[0]) setNewLine((l) => ({ ...l, rateCatalogItemId: items[0].id }));
    });
    apiFetch<Warehouse[]>("/materials/warehouses").then((list) => {
      setWarehouses(list);
      if (list[0]) setIssueWarehouseId(list[0].id);
    });
    apiFetch<CostCode[]>("/cost-codes").then(setCostCodes);
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
    try {
      const result = await apiFetch<{ emailSentTo: string | null }>(`/estimates/${estimateId}/send`, { method: "POST" });
      setEmailSentTo(result.emailSentTo);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!estimate?.clientAccessToken) return;
    await navigator.clipboard.writeText(`${window.location.origin}/estimate/${estimate.clientAccessToken}`);
    setLinkCopied(true);
  }

  async function declineOnBehalfOfClient() {
    const note = window.prompt(t("declineOnBehalfNotePrompt"));
    if (!note || !note.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/estimates/${estimateId}/decline`, { method: "POST", body: JSON.stringify({ note: note.trim() }) });
      load();
    } finally {
      setBusy(false);
    }
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
    return (
      <AuthenticatedShell>
        <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      </AuthenticatedShell>
    );
  }

  return (
    <AuthenticatedShell>
      <a href={`/projects/${estimate.project.id}`} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
        ← {estimate.project.name}
      </a>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {estimate.name}
          {estimate.variantLabel && (
            <span className="ml-2 rounded-full bg-brand-50 dark:bg-brand-500/15 px-2 py-0.5 text-xs font-medium text-brand-700 dark:text-brand-400 align-middle">
              {estimate.variantLabel}
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          {estimate.sentAt && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                estimate.clientDecision === "approved"
                  ? "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500"
                  : estimate.clientDecision === "rejected"
                    ? "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500"
                    : estimate.clientDecision === "countered"
                      ? "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400"
                      : "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500"
              }`}
            >
              {t(`clientDecision_${estimate.clientDecision}`)}
            </span>
          )}
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              estimate.status === "approved"
                ? "bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-400"
                : estimate.status === "pending_approval"
                  ? "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
            }`}
          >
            {estimate.status === "approved" ? t("approved") : estimate.status === "pending_approval" ? t("pendingApproval") : t("draft")}
          </span>
          {estimate.sentAt && estimate.clientDecision === "pending" && (
            <button onClick={declineOnBehalfOfClient} disabled={busy} className="btn-secondary px-3 py-1 text-xs">
              {t("declineOnBehalfOfClient")}
            </button>
          )}
        </div>
      </div>
      {estimate.status === "pending_approval" && me?.company.requiredApprovalCount && (
        <div className="mt-2 rounded-lg border border-warning-200 bg-warning-50 dark:bg-warning-500/15 px-4 py-3">
          <p className="text-sm text-warning-700 dark:text-warning-500">
            {t("approvalProgress", { count: estimate.approvals.length, required: me.company.requiredApprovalCount })}
          </p>
          <p className="mt-1 text-xs text-warning-700 dark:text-warning-500">
            {estimate.approvals.map((a) => a.actorName).join(", ")}
          </p>
        </div>
      )}
      {estimate.clientDecision === "rejected" && estimate.clientDecisionNote && (
        <p className="mt-2 text-sm text-error-700 dark:text-error-500">
          {t("clientNote")}: {estimate.clientDecisionNote}
        </p>
      )}
      {estimate.clientDecision === "countered" && (
        <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50 dark:bg-brand-500/15 px-4 py-3">
          <p className="text-sm font-medium text-brand-700 dark:text-brand-400">
            {t("counterOfferReceived", { amount: estimate.counterOfferAmount ?? "", currency: estimate.currency })}
          </p>
          {estimate.clientDecisionNote && <p className="mt-1 text-sm text-brand-700 dark:text-brand-400">{estimate.clientDecisionNote}</p>}
          <button onClick={createRevisedVariant} disabled={busy} className="btn-secondary mt-2 px-3 py-1 text-xs">
            {t("createRevisedVariant")}
          </button>
        </div>
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
        <div className="mt-4 flex items-center justify-between rounded-lg border border-warning-200 bg-warning-50 dark:bg-warning-500/15 px-4 py-3">
          <p className="text-sm text-warning-700 dark:text-warning-500">{t("pricesChanged")}</p>
          <button onClick={recalculate} disabled={busy} className="btn-secondary shrink-0">
            {t("recalculate")}
          </button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
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
                    {line.materialsCost} {currency}
                  </td>
                  <td>
                    {line.laborCost} {currency}
                  </td>
                  <td className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>
                        {line.lineTotal} {currency}
                      </span>
                      {benchmarks[line.id] && Math.abs(benchmarks[line.id].deviationPercent) >= BENCHMARK_FLAG_THRESHOLD && (
                        <span
                          title={t("benchmarkHint", {
                            median: benchmarks[line.id].benchmarkMedian,
                            currency,
                            count: benchmarks[line.id].benchmarkSampleSize,
                          })}
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                            benchmarks[line.id].deviationPercent > 0
                              ? "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500"
                              : "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500"
                          }`}
                        >
                          {benchmarks[line.id].deviationPercent > 0 ? "+" : ""}
                          {benchmarks[line.id].deviationPercent}%
                        </span>
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
                  <span className="font-mono text-xs text-gray-400 dark:text-gray-500">{selectedRateItem.formula}</span>
                  {selectedRateItem.formulaParams.map((param) => (
                    <label key={param} className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
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
                    <span className="text-xs font-medium text-success-700 dark:text-success-500">
                      {t("computedQuantity", { value: formulaResult.value, unit: selectedRateItem.unit })}
                    </span>
                  )}
                  {formulaResult.error && <span className="text-xs text-error-600">{formulaResult.error}</span>}
                </div>
              )}
            </form>
          )}

          {estimate.status === "draft" && <AssemblyQuickAddPanel estimateId={estimateId} onAdded={load} />}

          {estimate.status === "draft" && <EstimateSuggestionsPanel estimateId={estimateId} onAdded={load} />}

          {estimate.status === "approved" && (
            <div className="mt-8">
              <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("materialRequirements")}</h2>
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
                  <h3 className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">{t("issueReport")}</h3>
                  <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
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
                          <td className={r.remainingStock < 0 ? "text-red-600" : ""}>{r.remainingStock}</td>
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
            <Row label={t("materialsCost")} value={`${estimate.materialsCostTotal} ${currency}`} />
            <Row label={t("laborCost")} value={`${estimate.laborCostTotal} ${currency}`} />
            <Row label={t("subtotal")} value={`${estimate.subtotal} ${currency}`} />
            <Row label={`${t("markupAmount")} (${estimate.markupPercent}%)`} value={`${estimate.markupAmount} ${currency}`} />
            <Row label={`${t("taxAmount")} (${estimate.taxPercent}%)`} value={`${estimate.taxAmount} ${currency}`} />
            <Row label={t("grandTotal")} value={`${estimate.grandTotal} ${currency}`} emphasize />
          </dl>

          <div className="mt-6 flex flex-col gap-2">
            {estimate.status === "draft" && (
              <button onClick={approve} disabled={busy || estimate.lines.length === 0} className="btn-primary">
                {t("approve")}
              </button>
            )}
            {estimate.status === "pending_approval" &&
              (estimate.approvals.some((a) => a.userId === me?.user.id) ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">{t("alreadyApprovedByYou")}</p>
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
            {estimate.status === "draft" && <p className="text-xs text-gray-400 dark:text-gray-500">{t("approveFirst")}</p>}
          </div>

          {estimate.status === "draft" && (
            <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{t("coverLetter")}</label>
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

          {estimate.sentAt && estimate.clientAccessToken && (
            <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t("clientLink")}</span>
              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  className="input flex-1 text-xs"
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/estimate/${estimate.clientAccessToken}`}
                />
                <button onClick={copyLink} className="btn-secondary shrink-0 px-3 py-1 text-xs">
                  {linkCopied ? tc("saved") : t("copyLink")}
                </button>
              </div>
              {emailSentTo !== undefined && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {emailSentTo ? tc("emailedTo", { email: emailSentTo }) : tc("noClientEmail")}
                </p>
              )}
            </div>
          )}

          <form onSubmit={saveAsTemplate} className="mt-6 flex flex-col gap-2 border-t border-gray-100 dark:border-gray-700 pt-4">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t("saveAsTemplate")}</span>
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
            {templateSaved && <p className="text-xs text-success-700 dark:text-success-500">{tc("saved")}</p>}
          </form>
        </div>
      </div>
    </AuthenticatedShell>
  );
}

function Row({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className={`flex justify-between ${emphasize ? "border-t border-gray-200 dark:border-gray-700 pt-2 font-semibold" : ""}`}>
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
