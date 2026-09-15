import { useCallback, useEffect, useState } from "react";
import { addNetworkStateListener, getNetworkStateAsync } from "expo-network";
import { ApiError, apiFetch, NetworkError } from "./api-client";
import { getDb } from "./offline-db";

export interface QueuedMutation {
  id: number;
  /** Stable across every attempt (the first, immediate try and every later retry/flush) — sent as
   * the Idempotency-Key header so the server recognizes a resend of the same logical mutation
   * (e.g. after the response to an already-committed write was lost) instead of applying it twice. */
  mutationId: string;
  kind: string;
  path: string;
  method: "POST" | "PATCH";
  body: unknown;
  createdAt: number;
  /** Set once the server has rejected this mutation — a real conflict, not a connectivity problem.
   * A failed item is skipped on later flushes so it doesn't block mutations queued after it; the
   * user resolves it explicitly via retryQueued()/discardQueued(). */
  error?: string;
}

interface MutationRow {
  id: number;
  mutationId: string;
  kind: string;
  path: string;
  method: "POST" | "PATCH";
  body: string | null;
  createdAt: number;
  error: string | null;
}

function toMutation(row: MutationRow): QueuedMutation {
  return {
    id: row.id,
    mutationId: row.mutationId,
    kind: row.kind,
    path: row.path,
    method: row.method,
    body: row.body === null ? null : JSON.parse(row.body),
    createdAt: row.createdAt,
    ...(row.error === null ? {} : { error: row.error }),
  };
}

const listeners = new Set<() => void>();

/** Lets every mounted useOfflineQueue() react to a mutation queued or flushed anywhere in the tree —
 * the React Native stand-in for the web client's window events. */
function notifyQueueChanged(): void {
  for (const listener of listeners) listener();
}

function newMutationId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function listQueued(): Promise<QueuedMutation[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<MutationRow>("SELECT * FROM mutations ORDER BY createdAt ASC, id ASC");
  return rows.map(toMutation);
}

/** Queues a mutation for later delivery. Call this only when a request has already failed because
 * the device is offline. */
async function queueMutation(
  kind: string,
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
  mutationId: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO mutations (mutationId, kind, path, method, body, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
    mutationId,
    kind,
    path,
    method,
    JSON.stringify(body),
    Date.now(),
  );
  notifyQueueChanged();
}

async function removeQueued(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM mutations WHERE id = ?", id);
  notifyQueueChanged();
}

async function markFailed(id: number, error: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE mutations SET error = ? WHERE id = ?", error, id);
  notifyQueueChanged();
}

/** Discards a mutation the server rejected — the user's explicit "give up on this one". */
export async function discardQueued(id: number): Promise<void> {
  await removeQueued(id);
}

async function deliver(item: QueuedMutation): Promise<void> {
  await apiFetch(item.path, {
    method: item.method,
    body: JSON.stringify(item.body),
    headers: { "Idempotency-Key": item.mutationId },
  });
}

/** Clears a mutation's failed state and re-attempts it immediately, outside the normal flush order —
 * for a user who resolved the underlying conflict and wants to retry just this one item. */
export async function retryQueued(id: number): Promise<{ ok: boolean; error?: string }> {
  const items = await listQueued();
  const item = items.find((i) => i.id === id);
  if (!item) return { ok: false, error: "Not found" };
  try {
    await deliver(item);
    await removeQueued(item.id);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(item.id, message);
    return { ok: false, error: message };
  }
}

/**
 * Submits a mutation immediately; if that fails because the device is offline (not because the
 * server rejected it), the mutation is queued for later instead of surfacing an error.
 */
export async function submitOrQueue<T = unknown>(
  kind: string,
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
): Promise<{ queued: boolean; data?: T }> {
  // Generated before the first attempt and reused if this ends up queued, so a retry — or this
  // very attempt's response arriving after the network dropped — is recognizable server-side as
  // the same mutation rather than a second one.
  const mutationId = newMutationId();
  try {
    const data = await apiFetch<T>(path, {
      method,
      body: JSON.stringify(body),
      headers: { "Idempotency-Key": mutationId },
    });
    return { queued: false, data };
  } catch (err) {
    if (err instanceof NetworkError) {
      // No response at all (offline, DNS, timeout). ApiError instead means the server responded
      // and rejected the request, which has to surface to the user immediately rather than being
      // silently queued.
      await queueMutation(kind, path, method, body, mutationId);
      return { queued: true };
    }
    throw err;
  }
}

let flushInFlight: Promise<{ flushed: number; failed: number; remaining: number }> | null = null;

/**
 * Flushes queued mutations in order. A network failure stops the pass immediately — nothing after
 * it can succeed either. A server rejection (ApiError: the record was edited or deleted elsewhere,
 * a validation error, …) is a genuine conflict rather than a connectivity problem: that item is
 * marked failed and skipped so it doesn't block everything queued behind it. Already-failed items
 * are skipped without retrying; the user resolves them explicitly.
 *
 * Unlike the web client this needs no cross-context lock — there is a single JS runtime per app —
 * so `flushInFlight` alone covers concurrent callers, with each item's Idempotency-Key as the
 * backstop if a write is somehow delivered twice.
 */
export async function flushQueue(): Promise<{ flushed: number; failed: number; remaining: number }> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = (async () => {
    const items = await listQueued();
    let flushed = 0;
    let failed = 0;
    for (const item of items) {
      if (item.error) {
        failed++;
        continue;
      }
      try {
        await deliver(item);
        await removeQueued(item.id);
        flushed++;
      } catch (err) {
        if (err instanceof ApiError) {
          await markFailed(item.id, err.message);
          failed++;
          continue;
        }
        break;
      }
    }
    const remaining = (await listQueued()).length;
    return { flushed, failed, remaining };
  })();
  try {
    return await flushInFlight;
  } finally {
    flushInFlight = null;
  }
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
    const { isInternetReachable, isConnected } = await getNetworkStateAsync();
    // isInternetReachable is undefined on platforms that can't determine it — fall back to
    // isConnected rather than refusing to sync at all.
    if (!(isInternetReachable ?? isConnected)) return;
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
    listeners.add(refresh);
    flush();
    const subscription = addNetworkStateListener(({ isConnected, isInternetReachable }) => {
      if (isInternetReachable ?? isConnected) flush();
    });
    return () => {
      listeners.delete(refresh);
      subscription.remove();
    };
  }, [refresh, flush]);

  return { pendingCount, failedItems, flushing, refresh, flush };
}
