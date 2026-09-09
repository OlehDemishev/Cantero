"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

type ClientDecision = "pending" | "approved" | "rejected" | "countered";
type EstimateStatus = "draft" | "pending_approval" | "approved";
interface VariantSummary {
  id: string;
  name: string;
  variantLabel: string | null;
  status: EstimateStatus;
  clientDecision: ClientDecision;
  grandTotal: string;
}

export function EstimateVariantsPanel({ estimateId, currency }: { estimateId: string; currency: string }) {
  const t = useTranslations("estimates");
  const tc = useTranslations("common");
  const router = useRouter();

  const [variants, setVariants] = useState<VariantSummary[] | null>(null);
  const [variantLabel, setVariantLabel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<VariantSummary[]>(`/estimates/${estimateId}/variants`).then(setVariants);
  }, [estimateId]);

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

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("variants")}</h2>
      {variants && variants.length > 1 && (
        <div className="overflow-x-auto">
        <table className="mb-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="py-2">{t("variantOption")}</th>
              <th>{tc("status")}</th>
              <th>{t("clientDecision_label")}</th>
              <th className="text-right">{t("grandTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.id} className={`border-b border-gray-100 dark:border-gray-700 ${v.id === estimateId ? "bg-gray-50 dark:bg-gray-700" : ""}`}>
                <td className="py-2">
                  {v.id === estimateId ? (
                    <span className="font-medium">{v.variantLabel ?? v.name}</span>
                  ) : (
                    <a href={`/estimates/${v.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
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
        </div>
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
  );
}
