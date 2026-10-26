"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { MaterialRfqStatus } from "@cantero/shared";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatCurrency } from "@/lib/format-currency";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/use-api";
import { Badge } from "@/components/ui/badge";

interface MaterialCatalogItem {
  id: string;
  code: string;
  name: string;
  unit: string;
}
interface Project {
  id: string;
  name: string;
}
interface Quote {
  id: string;
  unitPrice: string;
  notes: string | null;
  isAwarded: boolean;
  supplier: { id: string; name: string };
}
interface RfqLine {
  id: string;
  quantity: string;
  materialCatalogItem: MaterialCatalogItem;
  quotes: Quote[];
}
interface Rfq {
  id: string;
  title: string;
  status: MaterialRfqStatus;
  project: Project | null;
  lines: RfqLine[];
}
interface RfqSummary {
  id: string;
  title: string;
  status: MaterialRfqStatus;
  project: Project | null;
  lines: { id: string }[];
}
interface Supplier {
  id: string;
  name: string;
}
interface LineDraft {
  materialCatalogItemId: string;
  quantity: string;
}

export function MaterialRfqsPanel() {
  const t = useTranslations("materialRfqs");
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const { data: rfqs = null, error: rfqsError, reload: reloadRfqs } = useApi<RfqSummary[]>("/materials/rfqs");
  const [detail, setDetail] = useState<Rfq | null>(null);
  const [materials, setMaterials] = useState<MaterialCatalogItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", projectId: "" });
  const [lines, setLines] = useState<LineDraft[]>([{ materialCatalogItemId: "", quantity: "1" }]);
  const [quoteForms, setQuoteForms] = useState<Record<string, { supplierId: string; unitPrice: string }>>({});
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadRfqs();
  }

  function loadDetail(id: string) {
    apiFetch<Rfq>(`/materials/rfqs/${id}`).then(setDetail).catch(notifyApiError);
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    loadDetail(id);
  }

  useEffect(() => {
    apiFetch<MaterialCatalogItem[]>("/materials/catalog").then((items) => {
      setMaterials(items);
      setLines([{ materialCatalogItemId: items[0]?.id ?? "", quantity: "1" }]);
    }).catch(notifyApiError);
    apiFetch<Project[]>("/projects").then(setProjects).catch(notifyApiError);
    apiFetch<Supplier[]>("/materials/suppliers").then(setSuppliers).catch(notifyApiError);
  }, []);

  function addLine() {
    setLines((ls) => [...ls, { materialCatalogItemId: materials[0]?.id ?? "", quantity: "1" }]);
  }
  function updateLine(index: number, field: keyof LineDraft, value: string) {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }
  function removeLine(index: number) {
    setLines((ls) => ls.filter((_, i) => i !== index));
  }

  async function submitRfq(e: React.FormEvent) {
    e.preventDefault();
    const validLines = lines.filter((l) => l.materialCatalogItemId && Number(l.quantity) > 0);
    if (!form.title.trim() || validLines.length === 0) return;
    setBusy(true);
    try {
      await apiFetch("/materials/rfqs", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          projectId: form.projectId || undefined,
          lines: validLines.map((l) => ({ materialCatalogItemId: l.materialCatalogItemId, quantity: Number(l.quantity) })),
        }),
      });
      setForm({ title: "", projectId: "" });
      setLines([{ materialCatalogItemId: materials[0]?.id ?? "", quantity: "1" }]);
      setCreating(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function submitQuote(rfqId: string, rfqLineId: string) {
    const draft = quoteForms[rfqLineId];
    if (!draft?.supplierId || !draft.unitPrice) return;
    setBusy(true);
    try {
      await apiFetch(`/materials/rfqs/${rfqId}/quotes`, {
        method: "POST",
        body: JSON.stringify({ rfqLineId, supplierId: draft.supplierId, unitPrice: Number(draft.unitPrice) }),
      });
      setQuoteForms((f) => ({ ...f, [rfqLineId]: { supplierId: "", unitPrice: "" } }));
      loadDetail(rfqId);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function award(rfqId: string, quoteId: string) {
    setBusy(true);
    try {
      await apiFetch(`/materials/rfqs/${rfqId}/quotes/${quoteId}/award`, { method: "POST" });
      loadDetail(rfqId);
    } finally {
      setBusy(false);
    }
  }

  async function close(rfqId: string) {
    setBusy(true);
    try {
      await apiFetch(`/materials/rfqs/${rfqId}/close`, { method: "POST" });
      loadDetail(rfqId);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg-muted">{t("title")}</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newRfq")}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-fg-subtle">{t("hint")}</p>

      {creating && (
        <form onSubmit={submitRfq} className="card mb-4 flex flex-col gap-3">
          <div className="flex gap-3">
            <input
              required
              placeholder={t("rfqTitlePlaceholder")} aria-label={t("rfqTitlePlaceholder")}
              className="input flex-1"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            <select aria-label={ta("project")} className="input w-auto" value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
              <option value="">{t("companyWide")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            {lines.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <select aria-label={ta("material")}
                  className="input flex-1"
                  value={line.materialCatalogItemId}
                  onChange={(e) => updateLine(i, "materialCatalogItemId", e.target.value)}
                >
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.code})
                    </option>
                  ))}
                </select>
                <input aria-label={ta("quantity")}
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="input w-24"
                  value={line.quantity}
                  onChange={(e) => updateLine(i, "quantity", e.target.value)}
                />
                {lines.length > 1 && (
                  <button aria-label={ta("remove")} type="button" onClick={() => removeLine(i)} className="text-fg-subtle hover:text-danger-fg">
                    ×
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addLine} className="w-fit text-xs text-brand-700 dark:text-brand-400 hover:underline">
              {t("addLine")}
            </button>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("create")}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {rfqs === null ? (
        rfqsError ? <ErrorState error={rfqsError} onRetry={reloadRfqs} compact /> : <Skeleton lines={3} />
      ) : rfqs.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noRfqs")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rfqs.map((rfq) => {
            const expanded = expandedId === rfq.id;
            return (
              <li key={rfq.id} className="card">
                <button onClick={() => toggleExpand(rfq.id)} className="flex w-full items-center justify-between text-left">
                  <div>
                    <span className="text-sm font-medium text-fg">{rfq.title}</span>{" "}
                    <span className="text-xs text-fg-subtle">{rfq.project ? rfq.project.name : t("companyWide")}</span>
                  </div>
                  <Badge tone={rfq.status === "open" ? "brand" : "neutral"}>
                    {t(rfq.status)}
                  </Badge>
                </button>

                {expanded && !detail && <p className="mt-3 text-xs text-fg-subtle">{tc("loading")}</p>}

                {expanded && detail && detail.id === rfq.id && (
                  <div className="mt-3 flex flex-col gap-4 border-t border-gray-100 dark:border-gray-700 pt-3">
                    {detail.lines.map((line) => (
                      <div key={line.id}>
                        <div className="mb-1 text-xs font-semibold text-fg-muted">
                          {line.materialCatalogItem.name} — {line.quantity} {line.materialCatalogItem.unit}
                        </div>
                        {line.quotes.length === 0 ? (
                          <p className="text-xs text-fg-subtle">{t("noQuotesYet")}</p>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {line.quotes.map((q, i) => (
                              <li key={q.id} className="flex items-center justify-between text-xs">
                                <span className={i === 0 ? "font-medium text-success-fg" : "text-gray-600 dark:text-gray-300"}>
                                  {q.supplier.name} — {formatCurrency(q.unitPrice, currency, { maximumFractionDigits: 4 })}/{line.materialCatalogItem.unit}
                                  {" "}({formatCurrency((Number(q.unitPrice) * Number(line.quantity)), currency)})
                                  {q.isAwarded && <Badge tone="success" size="sm" className="ml-1.5">{t("awarded")}</Badge>}
                                </span>
                                {detail.status === "open" && !q.isAwarded && (
                                  <button onClick={() => award(detail.id, q.id)} className="text-brand-700 dark:text-brand-400 hover:underline">
                                    {t("award")}
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {detail.status === "open" && (
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <select aria-label={ta("supplier")}
                              className="input py-1 text-xs"
                              value={quoteForms[line.id]?.supplierId ?? ""}
                              onChange={(e) => setQuoteForms((f) => ({ ...f, [line.id]: { ...f[line.id], supplierId: e.target.value, unitPrice: f[line.id]?.unitPrice ?? "" } }))}
                            >
                              <option value="">{t("selectSupplier")}</option>
                              {suppliers.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              step="0.0001"
                              min="0"
                              placeholder={t("unitPricePlaceholder")} aria-label={t("unitPricePlaceholder")}
                              className="input w-24 py-1 text-xs"
                              value={quoteForms[line.id]?.unitPrice ?? ""}
                              onChange={(e) => setQuoteForms((f) => ({ ...f, [line.id]: { ...f[line.id], unitPrice: e.target.value, supplierId: f[line.id]?.supplierId ?? "" } }))}
                            />
                            <button onClick={() => submitQuote(detail.id, line.id)} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                              {t("addQuote")}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {detail.status === "open" && (
                      <button onClick={() => close(detail.id)} disabled={busy} className="w-fit text-xs text-fg-subtle hover:text-danger-fg">
                        {t("closeRfq")}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
