"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiUpload } from "./api-client";
import { withStore, MUTATIONS_STORE } from "./offline-db";

export interface QueuedMutation {
  id: number;
  kind: string;
  path: string;
  method: "POST" | "PATCH";
  body: unknown;
  createdAt: number;
  /** Set only for a queued file upload — IndexedDB can store a Blob directly via structured clone. */
  file?: Blob;
  fileName?: string;
}

const QUEUE_CHANGED_EVENT = "cantero-offline-queue-changed";

/** Lets every mounted useOfflineQueue() instance react to a mutation queued or flushed anywhere in the tree. */
function notifyQueueChanged(): void {
  window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
}

/** Queues a mutation for later delivery. Call this only when a request has already failed due to being offline. */
export async function queueMutation(kind: string, path: string, method: "POST" | "PATCH", body: unknown): Promise<void> {
  await withStore(MUTATIONS_STORE, "readwrite", (store) =>
    store.add({ kind, path, method, body, createdAt: Date.now() } as QueuedMutation),
  );
  notifyQueueChanged();
}

/** Queues a file upload for later delivery (e.g. an expense receipt photo taken while offline) — same
 * "only call after a real network failure" contract as queueMutation. */
export async function queueFileUpload(kind: string, path: string, file: Blob, fileName: string): Promise<void> {
  await withStore(MUTATIONS_STORE, "readwrite", (store) =>
    store.add({ kind, path, method: "POST", body: null, file, fileName, createdAt: Date.now() } as QueuedMutation),
  );
  notifyQueueChanged();
}

export async function listQueued(): Promise<QueuedMutation[]> {
  const all = await withStore<QueuedMutation[]>(MUTATIONS_STORE, "readonly", (store) => store.getAll());
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

async function removeQueued(id: number): Promise<void> {
  await withStore(MUTATIONS_STORE, "readwrite", (store) => store.delete(id));
  notifyQueueChanged();
}

/**
 * Submits a mutation immediately; if that fails because the device is offline
 * (not because the server rejected it), the mutation is queued for later instead
 * of surfacing an error to the user.
 */
export async function submitOrQueue<T = unknown>(
  kind: string,
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
): Promise<{ queued: boolean; data?: T }> {
  try {
    const data = await apiFetch<T>(path, { method, body: JSON.stringify(body) });
    return { queued: false, data };
  } catch (err) {
    if (err instanceof TypeError) {
      // fetch() throws a plain TypeError for network failures (offline, DNS, etc.) —
      // ApiError means the server responded and rejected the request, which should
      // surface to the user immediately rather than being silently queued.
      await queueMutation(kind, path, method, body);
      return { queued: true };
    }
    throw err;
  }
}

/** Upload variant of submitOrQueue — tries the network first, queues the Blob itself on a real
 * network failure instead of silently dropping it (the previous behavior for e.g. expense receipts). */
export async function submitOrQueueUpload<T = unknown>(
  kind: string,
  path: string,
  file: File,
): Promise<{ queued: boolean; data?: T }> {
  try {
    const data = await apiUpload<T>(path, file);
    return { queued: false, data };
  } catch (err) {
    if (err instanceof TypeError) {
      await queueFileUpload(kind, path, file, file.name);
      return { queued: true };
    }
    throw err;
  }
}

let flushInFlight: Promise<{ flushed: number; remaining: number }> | null = null;

/**
 * Flushes queued mutations in order, stopping at the first failure so nothing is skipped or reordered.
 * Guarded against concurrent calls (e.g. React StrictMode double-mounting useOfflineQueue, or multiple
 * mounted instances of it) — without this, two overlapping passes could each read the same queued item
 * before either had deleted it, submitting it to the server twice.
 */
export async function flushQueue(): Promise<{ flushed: number; remaining: number }> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = (async () => {
    const items = await listQueued();
    let flushed = 0;
    for (const item of items) {
      try {
        if (item.file) {
          await apiUpload(item.path, new File([item.file], item.fileName ?? "upload", { type: item.file.type }));
        } else {
          await apiFetch(item.path, { method: item.method, body: JSON.stringify(item.body) });
        }
        await removeQueued(item.id);
        flushed++;
      } catch {
        break;
      }
    }
    const remaining = (await listQueued()).length;
    return { flushed, remaining };
  })();
  try {
    return await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}

export function useOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(0);
  const [flushing, setFlushing] = useState(false);

  const refresh = useCallback(() => {
    listQueued()
      .then((items) => setPendingCount(items.length))
      .catch(() => {});
  }, []);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    setFlushing(true);
    try {
      await flushQueue();
    } finally {
      setFlushing(false);
      refresh();
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    if (navigator.onLine) flush();
    window.addEventListener("online", flush);
    window.addEventListener(QUEUE_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener(QUEUE_CHANGED_EVENT, refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pendingCount, flushing, refresh, flush };
}
