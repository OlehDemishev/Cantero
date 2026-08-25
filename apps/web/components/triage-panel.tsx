"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface TriageItem {
  kind: "rfi" | "punch_list_item";
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  score: number;
  link: string;
}

export function TriagePanel() {
  const t = useTranslations("dashboard");
  const [items, setItems] = useState<TriageItem[] | null>(null);

  useEffect(() => {
    apiFetch<TriageItem[]>("/insights/triage").then(setItems);
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("triageTitle")}</h2>
      <ul className="flex flex-col gap-2">
        {items.slice(0, 8).map((item) => (
          <li key={`${item.kind}-${item.id}`}>
            <a href={item.link} className="card flex items-center justify-between hover:border-gray-400">
              <div>
                <span className="font-medium">{item.title}</span>
                <span className="ml-2 text-sm text-gray-500">{item.projectName}</span>
              </div>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{item.score}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
