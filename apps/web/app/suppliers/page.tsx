"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ImportResult } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { MaterialRfqsPanel } from "@/components/material-rfqs-panel";
import { apiFetch, apiUpload } from "@/lib/api-client";

interface Supplier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}
interface Scorecard {
  totalOrders: number;
  receivedOrders: number;
  totalSpend: number;
  onTimeRate: number | null;
  averageDelayDays: number | null;
}

export default function SuppliersPage() {
  const t = useTranslations("suppliers");
  const tc = useTranslations("common");
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scorecards, setScorecards] = useState<Record<string, Scorecard>>({});
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState<ImportResult | null>(null);

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!scorecards[id]) {
      apiFetch<Scorecard>(`/materials/suppliers/${id}/scorecard`).then((s) => setScorecards((prev) => ({ ...prev, [id]: s })));
    }
  }

  function load() {
    apiFetch<Supplier[]>("/materials/suppliers").then(setSuppliers);
  }

  useEffect(load, []);

  async function syncCatalog(e: React.ChangeEvent<HTMLInputElement>, supplierId: string) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSyncBusy(true);
    setSyncResult(null);
    try {
      const result = await apiUpload<ImportResult>(`/materials/suppliers/${supplierId}/catalog-sync`, file);
      setSyncResult(result);
    } finally {
      setSyncBusy(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/materials/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          email: form.email || undefined,
          phone: form.phone || undefined,
        }),
      });
      setForm({ name: "", email: "", phone: "" });
      load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">{t("newSupplier")}</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              required
              placeholder={tc("name")}
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              placeholder={tc("email")}
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <input
              placeholder={tc("phone")}
              className="input"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <button type="submit" disabled={submitting} className="btn-primary">
              {tc("create")}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2">
          {!suppliers ? (
            <p className="text-gray-500">{tc("loading")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {suppliers.map((s) => {
                const card = scorecards[s.id];
                return (
                  <li key={s.id} className="card cursor-pointer" onClick={() => toggleExpand(s.id)}>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-sm text-gray-500">{s.email ?? s.phone ?? "—"}</div>
                    {expandedId === s.id && (
                      <div className="mt-3 border-t border-gray-100 pt-3" onClick={(e) => e.stopPropagation()}>
                        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                          {!card ? (
                            <span className="text-gray-400">{tc("loading")}</span>
                          ) : (
                            <>
                              <div>
                                <div className="text-gray-400">{t("totalOrders")}</div>
                                <div className="font-medium">{card.totalOrders}</div>
                              </div>
                              <div>
                                <div className="text-gray-400">{t("onTimeRate")}</div>
                                <div className="font-medium">{card.onTimeRate !== null ? `${Math.round(card.onTimeRate * 100)}%` : "—"}</div>
                              </div>
                              <div>
                                <div className="text-gray-400">{t("averageDelay")}</div>
                                <div className="font-medium">{card.averageDelayDays !== null ? `${card.averageDelayDays.toFixed(1)}d` : "—"}</div>
                              </div>
                              <div>
                                <div className="text-gray-400">{t("totalSpend")}</div>
                                <div className="font-medium">{card.totalSpend}</div>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="mt-3 border-t border-gray-100 pt-3">
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("catalogSync")}</p>
                          <p className="mb-2 text-xs text-gray-500">{t("catalogSyncHint")}</p>
                          <label className="btn-secondary inline-block cursor-pointer px-2.5 py-1 text-xs">
                            {syncBusy ? tc("loading") : t("uploadCatalogCsv")}
                            <input type="file" accept=".csv" className="hidden" disabled={syncBusy} onChange={(e) => syncCatalog(e, s.id)} />
                          </label>
                          {syncResult && (
                            <p className="mt-2 text-xs text-gray-600">
                              {t("catalogSyncResult", { updated: syncResult.created, skipped: syncResult.skipped })}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <MaterialRfqsPanel />
    </AuthenticatedShell>
  );
}
