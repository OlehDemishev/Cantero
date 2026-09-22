"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface SimilarItem {
  id: string;
  title: string;
  subtitle: string;
  link: string;
}

const DEBOUNCE_MS = 600;

/**
 * "This may already be filed" while someone writes a new RFI or punch item: existing items of the
 * same kind in the project that say the same thing, in any language (search/similar, local
 * embeddings). Only a hint — nothing is blocked. Stays silent while the text is short, and when
 * meaning-based search is turned off on the server.
 */
export function SimilarItemsHint({ type, projectId, text }: { type: "rfi" | "punch_list_item"; projectId: string; text: string }) {
  const t = useTranslations("similarItems");
  const [items, setItems] = useState<SimilarItem[]>([]);

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed.length < 12) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ type, projectId, text: trimmed.slice(0, 1000) });
      apiFetch<SimilarItem[]>(`/search/similar?${params.toString()}`)
        .then((found) => !cancelled && setItems(found))
        .catch(() => !cancelled && setItems([]));
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [type, projectId, text]);

  if (items.length === 0) return null;
  return (
    <div role="status" className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/15 dark:text-warning-500">
      <p className="font-medium">{t(type === "rfi" ? "titleRfi" : "titlePunch")}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={item.link} className="underline underline-offset-2 hover:no-underline" target="_blank">
              {item.title}
            </Link>
            {item.subtitle && <span className="text-warning-600 dark:text-warning-500/80"> · {item.subtitle}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
