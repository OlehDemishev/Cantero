"use client";

import { useState } from "react";
import type { BulkActionResult } from "@cantero/shared";

export function useBulkSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<BulkActionResult | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(ids: string[]) {
    setSelected((prev) => (prev.size === ids.length && ids.every((id) => prev.has(id)) ? new Set() : new Set(ids)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function dismissResult() {
    setResult(null);
  }

  return { selected, toggle, toggleAll, clearSelection, dismissResult, result, setResult };
}
