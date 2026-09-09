"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiUpload, ApiError } from "./api-client";
import { withStore, MUTATIONS_STORE } from "./offline-db";
import { resetStateInEffect } from "./effect-reset";

export interface QueuedMutation {
  id: number;
  /** Stable across every attempt (the first, immediate try and every later retry/flush) — sent
   * as the Idempotency-Key header so the server can recognize a resend of the same logical
   * mutation (e.g. after the response to an already-committed write was lost) instead of applying
   * it twice. Generated once, at the very first attempt, in submitOrQueue()/submitOrQueueUpload(). */
  mutationId: string;
  kind: string;
  path: string;
  method: "POST" | "PATCH";
  body: unknown;
  createdAt: number;
  /** Set only for a queued file upload — IndexedDB can store a Blob directly via structured clone. */
  file?: Blob;
  fileName?: string;
  /** Set once the server has rejected this mutation (e.g. the record it targets was edited or
   * deleted elsewhere in the meantime) — a real conflict, not a connectivity problem. A failed
   * item is skipped on later flushes so it doesn't block mutations queued after it; the user
   * resolves it explicitly via retryQueued()/discardQueued(). */
  error?: string;
}

const QUEUE_CHANGED_EVENT = "cantero-offline-queue-changed";
/** Web Locks API name coordinating flushQueue() across every tab of this origin — see flushQueue(). */
const FLUSH_LOCK_NAME = "cantero-offline-flush";

function newMutationId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Lets every mounted useOfflineQueue() instance react to a mutation queued or flushed anywhere in the tree. */
function notifyQueueChanged(): void {
  window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
}

/** Queues a mutation for later delivery. Call this only when a request has already failed due to being offline. */
export async function queueMutation(
  kind: string,
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
  mutationId: string = newMutationId(),
): Promise<void> {
  await withStore(MUTATIONS_STORE, "readwrite", (store) =>
    store.add({ mutationId, kind, path, method, body, createdAt: Date.now() } as QueuedMutation),
  );
  notifyQueueChanged();
}

/** Queues a file upload for later delivery (e.g. an expense receipt photo taken while offline) — same
 * "only call after a real network failure" contract as queueMutation. */
export async function queueFileUpload(
  kind: string,
  path: string,
  file: Blob,
  fileName: string,
  mutationId: string = newMutationId(),
): Promise<void> {
  await withStore(MUTATIONS_STORE, "readwrite", (store) =>
    store.add({ mutationId, kind, path, method: "POST", body: null, file, fileName, createdAt: Date.now() } as QueuedMutation),
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

async function markFailed(item: QueuedMutation, error: string): Promise<void> {
  await withStore(MUTATIONS_STORE, "readwrite", (store) => store.put({ ...item, error }));
  notifyQueueChanged();
}

/** Discards a mutation the server rejected — the user's explicit "give up on this one" action. */
export async function discardQueued(id: number): Promise<void> {
  await removeQueued(id);
}

/** Clears a mutation's failed state and re-attempts it immediately, outside the normal flush order —
 * for a user who fixed the underlying conflict (e.g. reloaded and re-entered the field) and wants to
 * retry just this one item. */
export async function retryQueued(id: number): Promise<{ ok: boolean; error?: string }> {
  const items = await listQueued();
  const item = items.find((i) => i.id === id);
  if (!item) return { ok: false, error: "Not found" };
  try {
    if (item.file) {
      await apiUpload(item.path, new File([item.file], item.fileName ?? "upload", { type: item.file.type }), item.mutationId);
    } else {
      await apiFetch(item.path, { method: item.method, body: JSON.stringify(item.body), headers: { "Idempotency-Key": item.mutationId } });
    }
    await removeQueued(item.id);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(item, message);
    return { ok: false, error: message };
  }
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
  // Generated before the first attempt and reused if this ends up queued, so a retry (or the
  // original request's own response arriving late) is recognizable server-side as the same
  // mutation — including the case this very attempt actually succeeded but its response was lost
  // to the same network failure that's about to look like "offline" below.
  const mutationId = newMutationId();
  try {
    const data = await apiFetch<T>(path, { method, body: JSON.stringify(body), headers: { "Idempotency-Key": mutationId } });
    return { queued: false, data };
  } catch (err) {
    if (err instanceof TypeError) {
      // fetch() throws a plain TypeError for network failures (offline, DNS, etc.) —
      // ApiError means the server responded and rejected the request, which should
      // surface to the user immediately rather than being silently queued.
      await queueMutation(kind, path, method, body, mutationId);
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
  const mutationId = newMutationId();
  try {
    const data = await apiUpload<T>(path, file, mutationId);
    return { queued: false, data };
  } catch (err) {
    if (err instanceof TypeError) {
      await queueFileUpload(kind, path, file, file.name, mutationId);
      return { queued: true };
    }
    throw err;
  }
}

let flushInFlight: Promise<{ flushed: number; failed: number; remaining: number }> | null = null;

/**
 * Flushes queued mutations in order. A network failure (offline again) stops the pass immediately —
 * nothing after it can succeed either. A server rejection (ApiError — the record it targets was
 * edited or deleted elsewhere, a validation error, etc.) is a genuine conflict, not a connectivity
 * problem: that item is marked failed and skipped, so it doesn't block every mutation queued after
 * it. Already-failed items are skipped without retrying — the user resolves them explicitly.
 *
 * Guarded two ways against a mutation being submitted twice: `flushInFlight` covers concurrent
 * calls within this one JS context (e.g. React StrictMode double-mounting useOfflineQueue), and
 * the Web Locks request below covers the same race across every other tab/window of this origin —
 * IndexedDB is shared per-origin, not per-tab, so two tabs each running their own flush could
 * otherwise both read the same queued item before either had deleted it. Each item's own
 * Idempotency-Key (see submitOrQueue) is the last line of defense if both guards are somehow lost
 * (e.g. a lock-unaware older tab from a stale service worker).
 */
export async function flushQueue(): Promise<{ flushed: number; failed: number; remaining: number }> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = runWithFlushLock(async () => {
    const items = await listQueued();
    let flushed = 0;
    let failed = 0;
    for (const item of items) {
      if (item.error) {
        failed++;
        continue;
      }
      try {
        if (item.file) {
          await apiUpload(item.path, new File([item.file], item.fileName ?? "upload", { type: item.file.type }), item.mutationId);
        } else {
          await apiFetch(item.path, { method: item.method, body: JSON.stringify(item.body), headers: { "Idempotency-Key": item.mutationId } });
        }
        await removeQueued(item.id);
        flushed++;
      } catch (err) {
        if (err instanceof ApiError) {
          await markFailed(item, err.message);
          failed++;
          continue;
        }
        break;
      }
    }
    const remaining = (await listQueued()).length;
    return { flushed, failed, remaining };
  });
  try {
    return await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}

/** Runs `fn` under a cross-tab exclusive lock when the Web Locks API is available, falling back to
 * running it directly (no cross-tab protection, but still correct within this tab) on a browser
 * that lacks it — Safari added support in 2022, but this must never be the reason offline sync
 * stops working on an older one. */
function runWithFlushLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || !("locks" in navigator)) return fn();
  return navigator.locks.request(FLUSH_LOCK_NAME, fn) as Promise<T>;
}

export function useOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(0);
  const [failedItems, setFailedItems] = useState<QueuedMutation[]>([]);
  const [flushing, setFlushing] = useState(false);

  const refresh = useCallback(() => {
    listQueued()
      .then((items) => {
        setPendingCount(items.filter((i) => !i.error).length);
        setFailedItems(items.filter((i) => !!i.error));
      })
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
    if (navigator.onLine) resetStateInEffect(flush);
    window.addEventListener("online", flush);
    window.addEventListener(QUEUE_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener(QUEUE_CHANGED_EVENT, refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pendingCount, failedItems, flushing, refresh, flush };
}
