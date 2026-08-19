"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failures (e.g. unsupported browser) are non-fatal: the app
        // still works fully online, it just won't be installable/offline-capable.
      });
    }
  }, []);

  return null;
}
