"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface ChecklistStep {
  key: string;
  done: boolean;
  link: string;
}

/** Computed live from real company state (see MeController.onboardingChecklist) — not a
 * persisted per-step tracker, so it always reflects what's actually true. Disappears once every
 * step is done. */
export function OnboardingChecklist() {
  const t = useTranslations("onboardingChecklist");
  const [steps, setSteps] = useState<ChecklistStep[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    apiFetch<ChecklistStep[]>("/me/onboarding-checklist").then(setSteps);
  }, []);

  if (!steps || dismissed || steps.every((s) => s.done)) return null;

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="card mt-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">{t("title")}</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("subtitle", { done: doneCount, total: steps.length })}</p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          {t("dismiss")}
        </button>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-brand-500 transition-all"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      <ul className="mt-4 flex flex-col gap-1.5">
        {steps.map((step) => (
          <li key={step.key}>
            <a
              href={step.link}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-white/5 ${
                step.done ? "text-gray-400 line-through" : "text-gray-700 dark:text-gray-300"
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                  step.done
                    ? "border-success-500 bg-success-500 text-white"
                    : "border-gray-300 text-transparent dark:border-gray-600"
                }`}
              >
                ✓
              </span>
              {t(step.key)}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
