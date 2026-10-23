"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useHotkey } from "@/lib/use-hotkey";
import { Dialog } from "@/components/ui/dialog";

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

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title={t("shortcutsTitle")} showCloseButton panelClassName="max-w-sm p-5">
      <ul className="mt-3 flex flex-col gap-2">
        {SHORTCUTS.map((s) => (
          <li key={s.combo} className="flex items-center justify-between text-sm">
            <span className="text-fg-muted">{t(s.labelKey)}</span>
            <kbd className="rounded border border-border bg-surface-muted px-2 py-0.5 text-xs text-fg-muted">{s.combo}</kbd>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
