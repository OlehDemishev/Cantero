"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
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
interface Estimate {
  id: string;
  name: string;
  status: "draft" | "approved";
  laborRatePerHour: string;
  markupPercent: string;
  taxPercent: string;
  materialsCostTotal: string;
  laborCostTotal: string;
  subtotal: string;
  markupAmount: string;
  taxAmount: string;
  grandTotal: string;
  lines: EstimateLine[];
  requirements: Requirement[];
  project: { id: string; name: string };
}

export function EstimateDetail({ estimateId }: { estimateId: string }) {
  const t = useTranslations("estimates");
  const tc = useTranslations("common");
  const router = useRouter();
  const { data: me } = useMe();

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [rateItems, setRateItems] = useState<RateCatalogItem[]>([]);
  const [newLine, setNewLine] = useState({ rateCatalogItemId: "", quantity: "1" });
  const [busy, setBusy] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [issueWarehouseId, setIssueWarehouseId] = useState("");
  const [issueReport, setIssueReport] = useState<IssueReportLine[] | null>(null);

  function load() {
    apiFetch<Estimate>(`/estimates/${estimateId}`).then(setEstimate);
  }

  useEffect(() => {
    load();
    apiFetch<RateCatalogItem[]>("/estimates/rate-catalog").then((items) => {
      setRateItems(items);
      if (items[0]) setNewLine((l) => ({ ...l, rateCatalogItemId: items[0].id }));
    });
    apiFetch<Warehouse[]>("/materials/warehouses").then((list) => {
      setWarehouses(list);
      if (list[0]) setIssueWarehouseId(list[0].id);
    });
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
        body: JSON.stringify({ rateCatalogItemId: newLine.rateCatalogItemId, quantity: Number(newLine.quantity) }),
      });
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
        <p className="text-gray-500">{tc("loading")}</p>
      </AuthenticatedShell>
    );
  }

  return (
    <AuthenticatedShell>
      <a href={`/projects/${estimate.project.id}`} className="text-sm text-gray-500 hover:underline">
        ← {estimate.project.name}
      </a>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{estimate.name}</h1>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            estimate.status === "approved" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
          }`}
        >
          {estimate.status === "approved" ? t("approved") : t("draft")}
        </span>
      </div>

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
              <button type="submit" disabled={busy} className="btn-secondary">
                {t("addLine")}
              </button>
            </form>
          )}

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
            {estimate.status === "approved" && (
              <button onClick={generateInvoice} disabled={busy} className="btn-primary">
                {t("generateInvoice")}
              </button>
            )}
            <button onClick={downloadPdf} className="btn-secondary">
              {t("downloadPdf")}
            </button>
            {estimate.status === "draft" && <p className="text-xs text-gray-400">{t("approveFirst")}</p>}
          </div>
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
