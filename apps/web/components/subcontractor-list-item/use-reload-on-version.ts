"use client";

import { useEffect, useRef } from "react";

/** Runs `reload` each time `version` moves on (not on mount, where the data loads by itself). */
export function useReloadOnVersion(version: number, reload: () => void) {
  const seen = useRef(version);
  useEffect(() => {
    if (seen.current === version) return;
    seen.current = version;
    reload();
  }, [version, reload]);
}
