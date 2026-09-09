"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { EmptyState } from "@/components/ui/empty-state";

interface ToolCheckout {
  id: string;
  quantity: number;
  checkedOutAt: string;
  returnedAt: string | null;
  returnCondition: "good" | "damaged" | "lost" | null;
  chargeAmount: string | null;
  item: { id: string; name: string };
}
interface ToolLiability {
  totalCharged: number;
}

export function WorkerToolCheckoutsPanel({ workerId, currency }: { workerId: string; currency: string }) {
  const tt = useTranslations("toolCrib");
  const t = useTranslations("team");
  const [toolCheckouts, setToolCheckouts] = useState<ToolCheckout[] | null>(null);
  const [toolLiability, setToolLiability] = useState<ToolLiability | null>(null);

  useEffect(() => {
    apiFetch<ToolCheckout[]>(`/workers/${workerId}/tool-checkouts`).then(setToolCheckouts);
    apiFetch<ToolLiability>(`/workers/${workerId}/tool-liability`).then(setToolLiability);
  }, [workerId]);

  if (toolCheckouts === null) return null;

  return (
    <>
      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{tt("checkedOutTools")}</h2>
        {toolLiability && toolLiability.totalCharged > 0 && (
          <span className="text-xs font-medium text-error-700 dark:text-error-500">
            {tt("totalCharged", { amount: toolLiability.totalCharged, currency })}
          </span>
        )}
      </div>
      {toolCheckouts.length === 0 ? (
        <EmptyState message={t("noToolCheckouts")} cta={{ label: t("checkOutTool"), href: "/tool-crib" }} />
      ) : (
      <ul className="flex flex-col gap-1.5">
        {toolCheckouts.map((co) => (
          <li key={co.id} className="card text-sm">
            <div className="flex items-center justify-between">
              <span>
                {co.item.name} <span className="text-xs text-gray-400 dark:text-gray-500">× {co.quantity}</span>
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  !co.returnedAt ? "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                {!co.returnedAt ? tt("stillOut") : tt(`condition_${co.returnCondition}`)}
              </span>
            </div>
            {co.chargeAmount && (
              <p className="mt-1 text-xs text-error-700 dark:text-error-500">
                {tt("chargeAmountLabel", { amount: co.chargeAmount, currency })}
              </p>
            )}
          </li>
        ))}
      </ul>
      )}
    </>
  );
}
