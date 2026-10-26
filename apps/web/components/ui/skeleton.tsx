"use client";

import { useTranslations } from "next-intl";

type SkeletonProps =
  | { variant?: "lines"; lines?: number; className?: string }
  | { variant: "block"; height?: string; className?: string }
  | { variant: "table"; rows?: number; columns?: number; className?: string };

const BAR = "rounded bg-gray-200 dark:bg-gray-700";
/** Line widths cycled through so a block of text placeholders doesn't look like a solid slab. */
const LINE_WIDTHS = ["w-3/4", "w-full", "w-5/6", "w-2/3"];

/**
 * Stands in for content that is on its way, in roughly its shape: a few text lines (the default), a
 * block (a chart, a card), or a table. Announced to screen readers as "Loading…" once.
 */
export function Skeleton(props: SkeletonProps) {
  const t = useTranslations("loadState");
  return (
    <div role="status" aria-busy="true" className={`animate-pulse ${props.className ?? ""}`}>
      <span className="sr-only">{t("loading")}</span>
      {props.variant === "block" ? (
        <div className={`${props.height ?? "h-32"} rounded-xl bg-gray-200 dark:bg-gray-700`} />
      ) : props.variant === "table" ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: (props.rows ?? 4) + 1 }, (_, row) => (
            <div key={row} className="flex gap-3">
              {Array.from({ length: props.columns ?? 4 }, (_, col) => (
                <div key={col} className={`h-4 flex-1 ${BAR} ${row === 0 ? "opacity-70" : ""}`} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {Array.from({ length: props.lines ?? 3 }, (_, i) => (
            <div key={i} className={`h-4 ${BAR} ${LINE_WIDTHS[i % LINE_WIDTHS.length]}`} />
          ))}
        </div>
      )}
    </div>
  );
}
