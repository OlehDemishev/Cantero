"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface ProgressDraw {
  id: string;
  number: string;
  status: string;
  percentComplete: number | null;
  retainageAmount: number;
  total: number;
  isRetainageRelease: boolean;
}
interface ProgressBillingSummary {
  contractTotal: number;
  percentBilled: number;
  totalBilledGross: number;
  totalRetainageHeld: number;
  retainageReleasedTotal: number;
  retainageRemaining: number;
  invoices: ProgressDraw[];
}

export function ProgressBillingPanel({ estimateId, currency }: { estimateId: string; currency: string }) {
  const t = useTranslations("progressBilling");
  const router = useRouter();

  const [summary, setSummary] = useState<ProgressBillingSummary | null>(null);
  const [form, setForm] = useState({ percentComplete: "", retainagePercent: "10" });
  const [releaseAmount, setReleaseAmount] = useState("");
  const [releasingPartial, setReleasingPartial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<ProgressBillingSummary>(`/invoices/progress-billing/${estimateId}`).then(setSummary);
  }

  useEffect(load, [estimateId]);

  async function generateDraw(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const invoice = await apiFetch<{ id: string }>("/invoices/progress-billing", {
        method: "POST",
        body: JSON.stringify({
          estimateId,
          percentComplete: Number(form.percentComplete),
          retainagePercent: Number(form.retainagePercent) || 0,
        }),
      });
      router.push(`/invoices/${invoice.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function releaseRetainage(amount?: number) {
    setBusy(true);
    setError(null);
    try {
      const invoice = await apiFetch<{ id: string }>(`/invoices/progress-billing/${estimateId}/release-retainage`, {
        method: "POST",
        body: JSON.stringify(amount ? { amount } : {}),
      });
      router.push(`/invoices/${invoice.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!summary) return null;

  const hasDraws = summary.invoices.some((i) => !i.isRetainageRelease);

  return (
    <div className="mt-6 border-t border-gray-100 pt-4">
      <h3 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h3>
      <p className="mb-3 text-xs text-gray-500">{t("hint")}</p>

      {hasDraws && (
        <div className="mb-3 flex flex-col gap-2 text-sm">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(summary.percentBilled, 100)}%` }} />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{t("percentBilled", { percent: summary.percentBilled })}</span>
            <span>
              {t("billedOfContract", { billed: summary.totalBilledGross.toFixed(2), total: summary.contractTotal.toFixed(2), currency })}
            </span>
          </div>
          {summary.totalRetainageHeld > 0 && (
            <div className="flex justify-between text-xs text-gray-500">
              <span>{t("retainageHeld")}</span>
              <span className="font-medium text-gray-700">
                {summary.totalRetainageHeld.toFixed(2)} {currency}
              </span>
            </div>
          )}
          <ul className="mt-1 flex flex-col gap-1">
            {summary.invoices.map((draw) => (
              <li key={draw.id} className="flex items-center justify-between text-xs">
                <a href={`/invoices/${draw.id}`} className="text-brand-700 hover:underline">
                  {draw.number}
                </a>
                <span className="text-gray-500">
                  {draw.isRetainageRelease
                    ? t("retainageReleaseLabel")
                    : t("drawLabel", { percent: draw.percentComplete ?? 0 })}
                </span>
                <span className="tabular-nums text-gray-700">
                  {draw.total.toFixed(2)} {currency}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="mb-2 text-xs text-error-600">{error}</p>}

      {summary.percentBilled < 100 && (
        <form onSubmit={generateDraw} className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-xs text-gray-500">
            {t("percentComplete")}
            <input
              type="number"
              min={summary.percentBilled + 0.01}
              max="100"
              step="0.01"
              required
              className="input"
              value={form.percentComplete}
              onChange={(e) => setForm((f) => ({ ...f, percentComplete: e.target.value }))}
            />
          </label>
          <label className="flex w-24 flex-col gap-1 text-xs text-gray-500">
            {t("retainagePercent")}
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className="input"
              value={form.retainagePercent}
              onChange={(e) => setForm((f) => ({ ...f, retainagePercent: e.target.value }))}
            />
          </label>
          <button type="submit" disabled={busy} className="btn-secondary">
            {t("generateDraw")}
          </button>
        </form>
      )}

      {summary.retainageReleasedTotal > 0 && (
        <p className="mt-2 text-xs text-success-700">
          {t("retainageReleasedSoFar", { amount: summary.retainageReleasedTotal.toFixed(2), currency })}
        </p>
      )}

      {summary.retainageRemaining > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          <button onClick={() => releaseRetainage()} disabled={busy} className="btn-secondary self-start">
            {t("releaseRetainage", { amount: summary.retainageRemaining.toFixed(2), currency })}
          </button>
          {!releasingPartial ? (
            <button onClick={() => setReleasingPartial(true)} className="self-start text-xs text-brand-700 hover:underline">
              {t("releasePartialInstead")}
            </button>
          ) : (
            <div className="flex items-end gap-2">
              <label className="flex w-32 flex-col gap-1 text-xs text-gray-500">
                {t("partialAmount")}
                <input
                  type="number"
                  min="0.01"
                  max={summary.retainageRemaining}
                  step="0.01"
                  className="input"
                  value={releaseAmount}
                  onChange={(e) => setReleaseAmount(e.target.value)}
                />
              </label>
              <button
                onClick={() => releaseRetainage(Number(releaseAmount))}
                disabled={busy || !releaseAmount}
                className="btn-secondary"
              >
                {t("releasePartial")}
              </button>
              <button onClick={() => setReleasingPartial(false)} className="text-xs text-gray-500 hover:underline">
                {t("cancel")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
