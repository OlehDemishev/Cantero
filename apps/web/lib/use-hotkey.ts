"use client";

import { useEffect } from "react";

/**
 * Global keyboard shortcut. `combo` is e.g. "mod+k" (mod = Cmd on Mac, Ctrl elsewhere) or a bare
 * key like "?". Bare (non-mod) combos are ignored while the user is typing in an input/textarea/
 * contenteditable, so they don't fire mid-sentence; mod-combos fire everywhere, matching how
 * Cmd+K behaves in most apps.
 */
export function useHotkey(combo: string, handler: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const parts = combo.toLowerCase().split("+");
    const key = parts[parts.length - 1];
    const needsMod = parts.includes("mod");
    const needsShift = parts.includes("shift");

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isTyping && !needsMod) return;

      const modOk = !needsMod || e.metaKey || e.ctrlKey;
      const shiftOk = !needsShift || e.shiftKey;
      if (modOk && shiftOk && e.key.toLowerCase() === key) {
        e.preventDefault();
        handler();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [combo, handler, enabled]);
}
