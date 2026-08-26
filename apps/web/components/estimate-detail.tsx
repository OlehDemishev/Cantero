"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { ProgressBillingPanel } from "@/components/progress-billing-panel";
import { EstimateSuggestionsPanel } from "@/components/estimate-suggestions-panel";
import { AssemblyQuickAddPanel } from "@/components/assembly-quick-add-panel";
import { RevisionDiffPanel } from "@/components/revision-diff-panel";
import type { CostCode } from "@/components/cost-codes-panel";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface RateCatalogItem {
  id: string;
  code: string;
  name: string;
  unit: string;
}
interface EstimateLine {
  id: string;
  rateCatalogItemId: string;
  quantity: string;
  materialsCost: string;
  laborCost: string;
  lineTotal: string;
}
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
type ClientDecision = "pending" | "approved" | "rejected";
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
  currentVersion: number;
  isStale: boolean;
  lines: EstimateLine[];
  requirements: Requirement[];
  project: { id: string; name: string };
  clientDecision: ClientDecision;
  sentAt: string | null;
  decisionAt: string | null;
  clientDecisionNote: string | null;
  clientAccessToken: string | null;
  variantOfId: string | null;
  variantLabel: string | null;
  coverLetter: string | null;
  signerName: string | null;
  approvals: EstimateApproval[];
}
interface VariantSummary {
  id: string;
  name: string;
  variantLabel: string | null;
  status: EstimateStatus;
  clientDecision: ClientDecision;
  grandTotal: string;
}
interface ChangeOrderLine {
  id: string;
  rateCatalogItemId: string;
  quantity: string;
  lineTotal: string;
  rateCatalogItem: { name: string; unit: string };
}
interface ChangeOrderApproval {
  userId: string;
  actorName: string;
  approvedAt: string;
}
interface ChangeOrder {
  id: string;
  number: number;
  title: string;
  description: string | null;
  status: "draft" | "pending_approval" | "approved";
  clientDecision: ClientDecision;
  sentAt: string | null;
  clientAccessToken: string | null;
  grandTotal: string;
  lines: ChangeOrderLine[];
  signerName: string | null;
  decisionAt: string | null;
  approvals: ChangeOrderApproval[];
}
interface RevisionSummary {
  id: string;
  versionNumber: number;
  grandTotal: string;
  createdAt: string;
}
interface RevisionLineSnapshot {
  rateCatalogItemCode: string;
  rateCatalogItemName: string;
  unit: string;
  quantity: number;
  materialsCost: number;
  laborCost: number;
  lineTotal: number;
}
interface Revision extends RevisionSummary {
  lines: RevisionLineSnapshot[];
}
interface ComparisonRow {
  code: string;
  name: string;
  unit: string;
  revQuantity: number | null;
  curQuantity: number | null;
  revTotal: number | null;
  curTotal: number | null;
  kind: "added" | "removed" | "changed" | "same";
}

function buildComparison(
  revision: Revision,
  currentLines: EstimateLine[],
  rateItemsById: Record<string, RateCatalogItem>,
): ComparisonRow[] {
  const currentByCode = new Map<string, { name: string; unit: string; quantity: number; lineTotal: number }>();
  for (const line of currentLines) {
    const info = rateItemsById[line.rateCatalogItemId];
    if (!info) continue;
    currentByCode.set(info.code, {
      name: info.name,
      unit: info.unit,
      quantity: Number(line.quantity),
      lineTotal: Number(line.lineTotal),
    });
  }
  const revByCode = new Map(revision.lines.map((l) => [l.rateCatalogItemCode, l]));
  const allCodes = new Set([...currentByCode.keys(), ...revByCode.keys()]);

  return Array.from(allCodes).map((code) => {
    const cur = currentByCode.get(code);
    const rev = revByCode.get(code);
    let kind: ComparisonRow["kind"] = "same";
    if (!rev) kind = "added";
    else if (!cur) kind = "removed";
    else if (rev.quantity !== cur.quantity || rev.lineTotal !== cur.lineTotal) kind = "changed";
    return {
      code,
      name: cur?.name ?? rev?.rateCatalogItemName ?? code,
      unit: cur?.unit ?? rev?.unit ?? "",
      revQuantity: rev?.quantity ?? null,
      curQuantity: cur?.quantity ?? null,
      revTotal: rev?.lineTotal ?? null,
      curTotal: cur?.lineTotal ?? null,
      kind,
    };
  });
}

export function EstimateDetail({ estimateId }: { estimateId: string }) {
  const t = useTranslations("estimates");
  const tc = useTranslations("common");
  const router = useRouter();
  const { data: me } = useMe();

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [rateItems, setRateItems] = useState<RateCatalogItem[]>([]);
  const [newLine, setNewLine] = useState({ rateCatalogItemId: "", quantity: "1", costCodeId: "" });
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [busy, setBusy] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [issueWarehouseId, setIssueWarehouseId] = useState("");
  const [issueReport, setIssueReport] = useState<IssueReportLine[] | null>(null);

  const [templateName, setTemplateName] = useState("");
  const [templateSaved, setTemplateSaved] = useState(false);
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);
  const [loadingRevision, setLoadingRevision] = useState(false);
  const [variants, setVariants] = useState<VariantSummary[] | null>(null);
  const [variantLabel, setVariantLabel] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [emailSentTo, setEmailSentTo] = useState<string | null | undefined>(undefined);

  const [changeOrders, setChangeOrders] = useState<ChangeOrder[] | null>(null);
  const [coForm, setCoForm] = useState({ title: "", description: "" });
  const [coLineForm, setCoLineForm] = useState<Record<string, { rateCatalogItemId: string; quantity: string }>>({});
  const [coEmailSentTo, setCoEmailSentTo] = useState<Record<string, string | null>>({});
  const [coLinkCopiedId, setCoLinkCopiedId] = useState<string | null>(null);

  const [estimateSignatureUrl, setEstimateSignatureUrl] = useState<string | null>(null);
  const [coSignatureUrls, setCoSignatureUrls] = useState<Record<string, string>>({});

  const [coverLetterDraft, setCoverLetterDraft] = useState("");
  const [savingCoverLetter, setSavingCoverLetter] = useState(false);

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

  function loadRevisions() {
    apiFetch<RevisionSummary[]>(`/estimates/${estimateId}/revisions`).then(setRevisions);
  }

  function loadVariants() {
    apiFetch<VariantSummary[]>(`/estimates/${estimateId}/variants`).then(setVariants);
  }

  function loadChangeOrders() {
    apiFetch<ChangeOrder[]>(`/estimates/${estimateId}/change-orders`).then((list) => {
      setChangeOrders(list);
      for (const co of list) {
        if (co.clientDecision === "approved" && co.signerName) {
          apiFetch<Blob>(`/estimates/${estimateId}/change-orders/${co.id}/signature`).then((blob) =>
            setCoSignatureUrls((prev) => ({ ...prev, [co.id]: URL.createObjectURL(blob) })),
          );
        }
      }
    });
  }

  async function downloadChangeOrderPdf(co: ChangeOrder) {
    const blob = await apiFetch<Blob>(`/estimates/${estimateId}/change-orders/${co.id}/pdf`);
    downloadBlob(blob, `CO-${co.number}-${co.title}.pdf`);
  }

  useEffect(() => {
    load();
    loadRevisions();
    loadVariants();
    loadChangeOrders();
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

  const rateItemsById = Object.fromEntries(rateItems.map((r) => [r.id, r]));
  const currency = me?.company.currency ?? "";

  async function addLine(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/estimates/${estimateId}/lines`, {
        method: "POST",
        body: JSON.stringify({
          rateCatalogItemId: newLine.rateCatalogItemId,
          quantity: Number(newLine.quantity),
          costCodeId: newLine.costCodeId || undefined,
        }),
      });
      load();
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
      loadRevisions();
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

  async function createChangeOrder(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/estimates/${estimateId}/change-orders`, {
        method: "POST",
        body: JSON.stringify({ title: coForm.title, description: coForm.description || undefined }),
      });
      setCoForm({ title: "", description: "" });
      loadChangeOrders();
    } finally {
      setBusy(false);
    }
  }

  async function addChangeOrderLine(coId: string) {
    const line = coLineForm[coId] ?? { rateCatalogItemId: rateItems[0]?.id ?? "", quantity: "1" };
    if (!line.rateCatalogItemId) return;
    setBusy(true);
    try {
      await apiFetch(`/estimates/${estimateId}/change-orders/${coId}/lines`, {
        method: "POST",
        body: JSON.stringify({ rateCatalogItemId: line.rateCatalogItemId, quantity: Number(line.quantity) }),
      });
      loadChangeOrders();
    } finally {
      setBusy(false);
    }
  }

  async function approveChangeOrder(coId: string) {
    setBusy(true);
    try {
      await apiFetch(`/estimates/${estimateId}/change-orders/${coId}/approve`, { method: "POST" });
      loadChangeOrders();
    } finally {
      setBusy(false);
    }
  }

  async function sendChangeOrder(coId: string) {
    setBusy(true);
    try {
      const result = await apiFetch<{ emailSentTo: string | null }>(
        `/estimates/${estimateId}/change-orders/${coId}/send`,
        { method: "POST" },
      );
      setCoEmailSentTo((m) => ({ ...m, [coId]: result.emailSentTo }));
      loadChangeOrders();
    } finally {
      setBusy(false);
    }
  }

  async function copyChangeOrderLink(co: ChangeOrder) {
    if (!co.clientAccessToken) return;
    await navigator.clipboard.writeText(`${window.location.origin}/change-order/${co.clientAccessToken}`);
    setCoLinkCopiedId(co.id);
  }

  async function createVariant(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await apiFetch<{ id: string }>(`/estimates/${estimateId}/create-variant`, {
        method: "POST",
        body: JSON.stringify({ label: variantLabel }),
      });
      setVariantLabel("");
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

  async function viewRevision(revisionId: string) {
    setLoadingRevision(true);
    setSelectedRevision(null);
    try {
      const revision = await apiFetch<Revision>(`/estimates/${estimateId}/revisions/${revisionId}`);
      setSelectedRevision(revision);
    } finally {
      setLoadingRevision(false);
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
        <p className="text-gray-500">{tc("loading")}</p>
      </AuthenticatedShell>
    );
  }

  const comparison = selectedRevision ? buildComparison(selectedRevision, estimate.lines, rateItemsById) : null;

  return (
    <AuthenticatedShell>
      <a href={`/projects/${estimate.project.id}`} className="text-sm text-gray-500 hover:underline">
        ← {estimate.project.name}
      </a>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {estimate.name}
          {estimate.variantLabel && (
            <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 align-middle">
              {estimate.variantLabel}
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          {estimate.sentAt && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                estimate.clientDecision === "approved"
                  ? "bg-success-50 text-success-700"
                  : estimate.clientDecision === "rejected"
                    ? "bg-error-50 text-error-700"
                    : "bg-warning-50 text-warning-700"
              }`}
            >
              {t(`clientDecision_${estimate.clientDecision}`)}
            </span>
          )}
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              estimate.status === "approved"
                ? "bg-green-100 text-green-800"
                : estimate.status === "pending_approval"
                  ? "bg-warning-50 text-warning-700"
                  : "bg-gray-100 text-gray-600"
            }`}
          >
            {estimate.status === "approved" ? t("approved") : estimate.status === "pending_approval" ? t("pendingApproval") : t("draft")}
          </span>
        </div>
      </div>
      {estimate.status === "pending_approval" && me?.company.requiredApprovalCount && (
        <div className="mt-2 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3">
          <p className="text-sm text-warning-700">
            {t("approvalProgress", { count: estimate.approvals.length, required: me.company.requiredApprovalCount })}
          </p>
          <p className="mt-1 text-xs text-warning-700">
            {estimate.approvals.map((a) => a.actorName).join(", ")}
          </p>
        </div>
      )}
      {estimate.clientDecision === "rejected" && estimate.clientDecisionNote && (
        <p className="mt-2 text-sm text-error-700">
          {t("clientNote")}: {estimate.clientDecisionNote}
        </p>
      )}
      {estimate.clientDecision === "approved" && estimate.signerName && (
        <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
          {estimateSignatureUrl && (
            <img src={estimateSignatureUrl} alt={t("signature")} className="h-8 rounded border border-gray-200 bg-white px-1" />
          )}
          <span>
            {t("signedBy", { name: estimate.signerName })}
            {estimate.decisionAt && ` · ${new Date(estimate.decisionAt).toLocaleString()}`}
          </span>
        </div>
      )}

      {estimate.status === "draft" && estimate.isStale && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-warning-200 bg-warning-50 px-4 py-3">
          <p className="text-sm text-warning-700">{t("pricesChanged")}</p>
          <button onClick={recalculate} disabled={busy} className="btn-secondary shrink-0">
            {t("recalculate")}
          </button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2">{t("rateItem")}</th>
                <th>{t("quantity")}</th>
                <th>{t("materialsCost")}</th>
                <th>{t("laborCost")}</th>
                <th>{t("lineTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {estimate.lines.map((line) => (
                <tr key={line.id} className="border-b border-gray-100">
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
                    {line.lineTotal} {currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {estimate.status === "draft" && (
            <form onSubmit={addLine} className="mt-4 flex items-end gap-2">
              <select
                className="input"
                value={newLine.rateCatalogItemId}
                onChange={(e) => setNewLine((l) => ({ ...l, rateCatalogItemId: e.target.value }))}
              >
                {rateItems.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.unit})
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                className="input w-28"
                value={newLine.quantity}
                onChange={(e) => setNewLine((l) => ({ ...l, quantity: e.target.value }))}
              />
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
              <button type="submit" disabled={busy} className="btn-secondary">
                {t("addLine")}
              </button>
            </form>
          )}

          {estimate.status === "draft" && <AssemblyQuickAddPanel estimateId={estimateId} onAdded={load} />}

          {estimate.status === "draft" && <EstimateSuggestionsPanel estimateId={estimateId} onAdded={load} />}

          {estimate.status === "approved" && (
            <div className="mt-8">
              <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("materialRequirements")}</h2>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {estimate.requirements.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100">
                      <td className="py-2">{r.materialCatalogItem.name}</td>
                      <td className="text-right">
                        {r.quantity} {r.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

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
                  <h3 className="mb-2 text-xs font-semibold text-gray-500">{t("issueReport")}</h3>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-500">
                        <th className="py-1"></th>
                        <th>{t("required")}</th>
                        <th>{t("remainingStock")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {issueReport.map((r) => (
                        <tr key={r.materialCatalogItemId} className="border-b border-gray-100">
                          <td className="py-1">{r.name}</td>
                          <td>{r.required}</td>
                          <td className={r.remainingStock < 0 ? "text-red-600" : ""}>{r.remainingStock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {revisions && revisions.length > 0 && (
            <div className="mt-10">
              <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("revisionHistory")}</h2>
              <ul className="flex flex-col gap-2">
                {revisions.map((rev) => (
                  <li key={rev.id}>
                    <button
                      onClick={() => viewRevision(rev.id)}
                      className={`card flex w-full items-center justify-between text-left hover:border-gray-400 ${
                        selectedRevision?.id === rev.id ? "border-brand-300" : ""
                      }`}
                    >
                      <span className="text-sm font-medium">
                        {t("version")} {rev.versionNumber}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(rev.createdAt).toLocaleDateString()} · {rev.grandTotal} {currency}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {loadingRevision && <p className="mt-3 text-sm text-gray-400">{tc("loading")}</p>}

              {comparison && selectedRevision && (
                <div className="mt-4">
                  <h3 className="mb-2 text-xs font-semibold text-gray-500">
                    {t("compareToCurrent", { version: selectedRevision.versionNumber })}
                  </h3>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-500">
                        <th className="py-1">{t("rateItem")}</th>
                        <th>{t("version")} {selectedRevision.versionNumber}</th>
                        <th>{tc("status")}</th>
                        <th>{t("current")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.map((row) => (
                        <tr key={row.code} className="border-b border-gray-100">
                          <td className="py-1">{row.name}</td>
                          <td className={row.kind === "removed" ? "text-error-600" : ""}>
                            {row.revQuantity !== null ? `${row.revQuantity} ${row.unit} · ${row.revTotal} ${currency}` : "—"}
                          </td>
                          <td>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                row.kind === "added"
                                  ? "bg-success-50 text-success-700"
                                  : row.kind === "removed"
                                    ? "bg-error-50 text-error-700"
                                    : row.kind === "changed"
                                      ? "bg-warning-50 text-warning-700"
                                      : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {t(row.kind)}
                            </span>
                          </td>
                          <td className={row.kind === "added" ? "text-success-700" : ""}>
                            {row.curQuantity !== null ? `${row.curQuantity} ${row.unit} · ${row.curTotal} ${currency}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {revisions && <RevisionDiffPanel estimateId={estimateId} revisions={revisions} currency={currency} />}
            </div>
          )}

          <div className="mt-10">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("variants")}</h2>
            {variants && variants.length > 1 && (
              <table className="mb-4 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2">{t("variantOption")}</th>
                    <th>{tc("status")}</th>
                    <th>{t("clientDecision_label")}</th>
                    <th className="text-right">{t("grandTotal")}</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => (
                    <tr key={v.id} className={`border-b border-gray-100 ${v.id === estimateId ? "bg-gray-50" : ""}`}>
                      <td className="py-2">
                        {v.id === estimateId ? (
                          <span className="font-medium">{v.variantLabel ?? v.name}</span>
                        ) : (
                          <a href={`/estimates/${v.id}`} className="text-brand-700 hover:underline">
                            {v.variantLabel ?? v.name}
                          </a>
                        )}
                      </td>
                      <td>{v.status === "approved" ? t("approved") : t("draft")}</td>
                      <td>{t(`clientDecision_${v.clientDecision}`)}</td>
                      <td className="text-right">
                        {v.grandTotal} {currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <form onSubmit={createVariant} className="flex items-end gap-2">
              <input
                required
                placeholder={t("variantLabelPlaceholder")}
                className="input"
                value={variantLabel}
                onChange={(e) => setVariantLabel(e.target.value)}
              />
              <button type="submit" disabled={busy} className="btn-secondary shrink-0">
                {t("createVariant")}
              </button>
            </form>
          </div>

          {estimate.status === "approved" && (
            <div className="mt-10">
              <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("changeOrders")}</h2>
              <p className="mb-4 text-xs text-gray-500">{t("changeOrdersHint")}</p>

              {changeOrders && changeOrders.length > 0 && (
                <div className="mb-6 flex flex-col gap-4">
                  {changeOrders.map((co) => {
                    const line = coLineForm[co.id] ?? { rateCatalogItemId: rateItems[0]?.id ?? "", quantity: "1" };
                    return (
                      <div key={co.id} className="rounded-lg border border-gray-200 p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-900">
                            CO-{co.number} — {co.title}
                          </span>
                          <span className="text-xs text-gray-500">
                            {co.status === "approved" ? t("approved") : co.status === "pending_approval" ? t("pendingApproval") : t("draft")}
                            {co.sentAt && ` · ${t(`clientDecision_${co.clientDecision}`)}`}
                          </span>
                        </div>
                        {co.description && <p className="mt-1 text-xs text-gray-500">{co.description}</p>}

                        {co.status === "pending_approval" && me?.company.changeOrderRequiredApprovalCount && (
                          <div className="mt-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2">
                            <p className="text-xs text-warning-700">
                              {t("approvalProgress", { count: co.approvals.length, required: me.company.changeOrderRequiredApprovalCount })}
                            </p>
                            <p className="mt-0.5 text-xs text-warning-700">{co.approvals.map((a) => a.actorName).join(", ")}</p>
                          </div>
                        )}

                        {co.lines.length > 0 && (
                          <table className="mt-3 w-full border-collapse text-xs">
                            <tbody>
                              {co.lines.map((l) => (
                                <tr key={l.id} className="border-b border-gray-100">
                                  <td className="py-1">{l.rateCatalogItem.name}</td>
                                  <td>
                                    {l.quantity} {l.rateCatalogItem.unit}
                                  </td>
                                  <td className="text-right">
                                    {l.lineTotal} {currency}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <p className="mt-2 text-right text-xs font-medium">
                          {t("grandTotal")}: {co.grandTotal} {currency}
                        </p>

                        {co.status === "draft" && (
                          <div className="mt-3 flex items-end gap-2 border-t border-gray-100 pt-3">
                            <select
                              className="input"
                              value={line.rateCatalogItemId}
                              onChange={(e) =>
                                setCoLineForm((m) => ({ ...m, [co.id]: { ...line, rateCatalogItemId: e.target.value } }))
                              }
                            >
                              {rateItems.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name} ({r.unit})
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              step="0.01"
                              className="input w-24"
                              value={line.quantity}
                              onChange={(e) => setCoLineForm((m) => ({ ...m, [co.id]: { ...line, quantity: e.target.value } }))}
                            />
                            <button
                              type="button"
                              onClick={() => addChangeOrderLine(co.id)}
                              disabled={busy}
                              className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
                            >
                              {t("addLine")}
                            </button>
                            <button
                              type="button"
                              onClick={() => approveChangeOrder(co.id)}
                              disabled={busy || co.lines.length === 0}
                              className="btn-primary shrink-0 px-3 py-1.5 text-xs"
                            >
                              {t("approve")}
                            </button>
                          </div>
                        )}

                        {co.status === "pending_approval" && (
                          <div className="mt-3 border-t border-gray-100 pt-3">
                            <button
                              type="button"
                              onClick={() => approveChangeOrder(co.id)}
                              disabled={busy}
                              className="btn-primary px-3 py-1.5 text-xs"
                            >
                              {t("approve")}
                            </button>
                          </div>
                        )}

                        {co.status === "approved" && !co.sentAt && (
                          <button
                            type="button"
                            onClick={() => sendChangeOrder(co.id)}
                            disabled={busy}
                            className="btn-secondary mt-3 px-3 py-1.5 text-xs"
                          >
                            {t("sendToClient")}
                          </button>
                        )}

                        {co.sentAt && co.clientAccessToken && (
                          <div className="mt-3 border-t border-gray-100 pt-3">
                            <div className="flex items-center gap-2">
                              <input
                                readOnly
                                className="input flex-1 text-xs"
                                value={`${typeof window !== "undefined" ? window.location.origin : ""}/change-order/${co.clientAccessToken}`}
                              />
                              <button
                                type="button"
                                onClick={() => copyChangeOrderLink(co)}
                                className="btn-secondary shrink-0 px-3 py-1 text-xs"
                              >
                                {coLinkCopiedId === co.id ? tc("saved") : t("copyLink")}
                              </button>
                            </div>
                            {coEmailSentTo[co.id] !== undefined && (
                              <p className="mt-2 text-xs text-gray-500">
                                {coEmailSentTo[co.id]
                                  ? tc("emailedTo", { email: coEmailSentTo[co.id] as string })
                                  : tc("noClientEmail")}
                              </p>
                            )}
                          </div>
                        )}

                        {co.clientDecision === "approved" && co.signerName && (
                          <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3 text-xs text-gray-600">
                            {coSignatureUrls[co.id] && (
                              <img
                                src={coSignatureUrls[co.id]}
                                alt={t("signature")}
                                className="h-6 rounded border border-gray-200 bg-white px-1"
                              />
                            )}
                            <span>
                              {t("signedBy", { name: co.signerName })}
                              {co.decisionAt && ` · ${new Date(co.decisionAt).toLocaleString()}`}
                            </span>
                            <button
                              type="button"
                              onClick={() => downloadChangeOrderPdf(co)}
                              className="btn-secondary ml-auto shrink-0 px-2 py-1 text-xs"
                            >
                              {t("downloadPdf")}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <form onSubmit={createChangeOrder} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <input
                  required
                  placeholder={t("changeOrderTitlePlaceholder")}
                  className="input"
                  value={coForm.title}
                  onChange={(e) => setCoForm((f) => ({ ...f, title: e.target.value }))}
                />
                <input
                  placeholder={t("changeOrderDescriptionPlaceholder")}
                  className="input"
                  value={coForm.description}
                  onChange={(e) => setCoForm((f) => ({ ...f, description: e.target.value }))}
                />
                <button type="submit" disabled={busy} className="btn-secondary shrink-0">
                  {t("createChangeOrder")}
                </button>
              </form>
            </div>
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
                <p className="text-xs text-gray-400">{t("alreadyApprovedByYou")}</p>
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
            {estimate.status === "draft" && <p className="text-xs text-gray-400">{t("approveFirst")}</p>}
          </div>

          {estimate.status === "draft" && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <label className="text-xs font-medium text-gray-500">{t("coverLetter")}</label>
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
            <div className="mt-4 border-t border-gray-100 pt-4">
              <span className="text-xs font-medium text-gray-500">{t("clientLink")}</span>
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
                <p className="mt-2 text-xs text-gray-500">
                  {emailSentTo ? tc("emailedTo", { email: emailSentTo }) : tc("noClientEmail")}
                </p>
              )}
            </div>
          )}

          <form onSubmit={saveAsTemplate} className="mt-6 flex flex-col gap-2 border-t border-gray-100 pt-4">
            <span className="text-xs font-medium text-gray-500">{t("saveAsTemplate")}</span>
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
            {templateSaved && <p className="text-xs text-success-700">{tc("saved")}</p>}
          </form>
        </div>
      </div>
    </AuthenticatedShell>
  );
}

function Row({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className={`flex justify-between ${emphasize ? "border-t border-gray-200 pt-2 font-semibold" : ""}`}>
      <dt className="text-gray-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
