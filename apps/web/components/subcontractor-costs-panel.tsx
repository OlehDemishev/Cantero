"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import type { CostCode } from "@/components/cost-codes-panel";

const NEW_SUBCONTRACTOR = "__new__";

interface Subcontractor {
  id: string;
  name: string;
}
interface LienWaiver {
  id: string;
  signedAt: string | null;
}
interface SubcontractorCost {
  id: string;
  description: string;
  amount: string;
  incurredDate: string;
  dueDate: string | null;
  paid: boolean;
  subcontractor: Subcontractor;
  lienWaiver: LienWaiver | null;
}

export function SubcontractorCostsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("subcontractors");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [costs, setCosts] = useState<SubcontractorCost[] | null>(null);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [form, setForm] = useState({
    subcontractorId: "",
    newSubcontractorName: "",
    description: "",
    amount: "",
    dueDate: "",
    costCodeId: "",
  });
  const [busy, setBusy] = useState(false);
  const [finalFlags, setFinalFlags] = useState<Record<string, boolean>>({});
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);

  function load() {
    apiFetch<SubcontractorCost[]>(`/finance/subcontractor-costs?projectId=${projectId}`).then(setCosts);
  }

  function loadSubcontractors() {
    apiFetch<Subcontractor[]>("/finance/subcontractors").then((list) => {
      setSubcontractors(list);
      if (list[0]) setForm((f) => ({ ...f, subcontractorId: f.subcontractorId || list[0].id }));
    });
  }

  useEffect(() => {
    load();
    loadSubcontractors();
    apiFetch<CostCode[]>("/cost-codes").then(setCostCodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let subcontractorId = form.subcontractorId;
      if (subcontractorId === NEW_SUBCONTRACTOR) {
        const created = await apiFetch<Subcontractor>("/finance/subcontractors", {
          method: "POST",
          body: JSON.stringify({ name: form.newSubcontractorName }),
        });
        subcontractorId = created.id;
      }
      await apiFetch("/finance/subcontractor-costs", {
        method: "POST",
        body: JSON.stringify({
          subcontractorId,
          projectId,
          description: form.description,
          amount: Number(form.amount),
          dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
          costCodeId: form.costCodeId || undefined,
        }),
      });
      setForm((f) => ({ ...f, newSubcontractorName: "", description: "", amount: "", dueDate: "", costCodeId: "" }));
      load();
      loadSubcontractors();
    } finally {
      setBusy(false);
    }
  }

  async function markPaid(id: string) {
    await apiFetch(`/finance/subcontractor-costs/${id}/mark-paid`, { method: "POST" });
    load();
  }

  async function requestWaiver(id: string) {
    await apiFetch(`/finance/subcontractor-costs/${id}/lien-waiver`, {
      method: "POST",
      body: JSON.stringify({ isFinal: !!finalFlags[id] }),
    });
    load();
  }

  async function downloadWaiverPdf(id: string, description: string) {
    const blob = await apiFetch<Blob>(`/finance/subcontractor-costs/${id}/lien-waiver/pdf`);
    downloadBlob(blob, `lien-waiver-${description}.pdf`);
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("title")}</h2>
      {!costs ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : costs.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noCosts")}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <tbody>
            {costs.map((c) => (
              <tr key={c.id} className="border-b border-gray-100">
                <td className="py-1.5">{c.description}</td>
                <td className="text-gray-500">{c.subcontractor.name}</td>
                <td className="text-gray-500">{c.dueDate ? new Date(c.dueDate).toLocaleDateString() : "—"}</td>
                <td>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.paid ? "bg-success-50 text-success-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {c.paid ? t("paid") : t("unpaid")}
                  </span>
                </td>
                <td className="text-right font-medium">
                  {c.amount} {currency}
                </td>
                <td className="text-right">
                  {!c.paid && (
                    <button onClick={() => markPaid(c.id)} className="btn-secondary px-2 py-1 text-xs">
                      {t("markPaid")}
                    </button>
                  )}
                </td>
                <td className="text-right">
                  {!c.lienWaiver ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <label className="flex items-center gap-1 text-xs text-gray-500">
                        <input
                          type="checkbox"
                          checked={!!finalFlags[c.id]}
                          onChange={(e) => setFinalFlags((f) => ({ ...f, [c.id]: e.target.checked }))}
                        />
                        {t("finalWaiver")}
                      </label>
                      <button onClick={() => requestWaiver(c.id)} className="btn-secondary px-2 py-1 text-xs">
                        {t("requestWaiver")}
                      </button>
                    </div>
                  ) : c.lienWaiver.signedAt ? (
                    <button onClick={() => downloadWaiverPdf(c.id, c.description)} className="btn-secondary px-2 py-1 text-xs">
                      {t("downloadWaiver")}
                    </button>
                  ) : (
                    <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-700">
                      {t("waiverAwaitingSignature")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap items-end gap-2">
        <select
          className="input w-auto"
          value={form.subcontractorId}
          onChange={(e) => setForm((f) => ({ ...f, subcontractorId: e.target.value }))}
        >
          {subcontractors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value={NEW_SUBCONTRACTOR}>{t("newSubcontractor")}</option>
        </select>
        {form.subcontractorId === NEW_SUBCONTRACTOR && (
          <input
            required
            placeholder={tc("name")}
            className="input w-auto"
            value={form.newSubcontractorName}
            onChange={(e) => setForm((f) => ({ ...f, newSubcontractorName: e.target.value }))}
          />
        )}
        <input
          required
          placeholder={t("description")}
          className="input w-auto"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <input
          required
          type="number"
          step="0.01"
          placeholder={t("amount")}
          className="input w-24"
          value={form.amount}
          onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
        />
        <input
          type="date"
          className="input w-auto"
          value={form.dueDate}
          onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
        />
        {costCodes.length > 0 && (
          <select
            className="input w-auto"
            value={form.costCodeId}
            onChange={(e) => setForm((f) => ({ ...f, costCodeId: e.target.value }))}
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
          {t("addCost")}
        </button>
      </form>
    </div>
  );
}
