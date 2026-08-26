"use client";

import { useState } from "react";
import { HelpCircleIcon } from "@/components/nav-icons";

/** A small "?" glyph next to a field label — hover/focus reveals a short explanation. Reserved
 * for fields whose meaning isn't obvious from the label alone (a threshold, a formula, a rarely-
 * used toggle), not sprinkled on every field. */
export function HelpTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="flex h-4 w-4 items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        aria-label={text}
      >
        <HelpCircleIcon width={14} height={14} />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-10 mb-1.5 w-56 -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-normal normal-case text-gray-600 shadow-theme-md dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {text}
        </span>
      )}
    </span>
  );
}
