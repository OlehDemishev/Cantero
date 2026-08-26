"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useHotkey } from "@/lib/use-hotkey";

const SHORTCUTS = [
  { combo: "⌘K / Ctrl+K", labelKey: "shortcutCommandPalette" },
  { combo: "?", labelKey: "shortcutHelp" },
  { combo: "Esc", labelKey: "shortcutClose" },
] as const;

/** Self-contained: owns its own open state and the "?" hotkey that toggles it. */
export function KeyboardShortcutsHelp() {
  const t = useTranslations("commandPalette");
  const [open, setOpen] = useState(false);

  useHotkey("?", () => setOpen((v) => !v));
  useHotkey("escape", () => setOpen(false), open);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">{t("shortcutsTitle")}</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {SHORTCUTS.map((s) => (
            <li key={s.combo} className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">{t(s.labelKey)}</span>
              <kbd className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300">
                {s.combo}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
