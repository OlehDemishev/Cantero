"use client";

import { useTranslations } from "next-intl";
import { useApi } from "@/lib/use-api";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/format-currency";

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
  const { data: toolCheckouts = null } = useApi<ToolCheckout[]>(`/workers/${workerId}/tool-checkouts`);
  const { data: toolLiability = null } = useApi<ToolLiability>(`/workers/${workerId}/tool-liability`);

  if (toolCheckouts === null) return null;

  return (
    <>
      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg-muted">{tt("checkedOutTools")}</h2>
        {toolLiability && toolLiability.totalCharged > 0 && (
          <span className="text-xs font-medium text-danger-fg">
            {tt("totalCharged", { amount: formatCurrency(toolLiability.totalCharged, currency) })}
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
                {co.item.name} <span className="text-xs text-fg-subtle">× {co.quantity}</span>
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  !co.returnedAt ? "bg-warning-50 dark:bg-warning-500/15 text-warning-fg" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                {!co.returnedAt ? tt("stillOut") : tt(`condition_${co.returnCondition}`)}
              </span>
            </div>
            {co.chargeAmount && (
              <p className="mt-1 text-xs text-danger-fg">
                {tt("chargeAmountLabel", { amount: formatCurrency(co.chargeAmount, currency) })}
              </p>
            )}
          </li>
        ))}
      </ul>
      )}
    </>
  );
}
