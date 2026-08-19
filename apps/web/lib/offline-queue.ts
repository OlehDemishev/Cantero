"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api-client";

const DB_NAME = "cantero-offline";
const STORE = "mutations";

export interface QueuedMutation {
  id: number;
  kind: string;
  path: string;
  method: "POST" | "PATCH";
  body: unknown;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Queues a mutation for later delivery. Call this only when a request has already failed due to being offline. */
export async function queueMutation(kind: string, path: string, method: "POST" | "PATCH", body: unknown): Promise<void> {
  await withStore("readwrite", (store) => store.add({ kind, path, method, body, createdAt: Date.now() } as QueuedMutation));
}

export async function listQueued(): Promise<QueuedMutation[]> {
  const all = await withStore<QueuedMutation[]>("readonly", (store) => store.getAll());
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

async function removeQueued(id: number): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

/**
 * Submits a mutation immediately; if that fails because the device is offline
 * (not because the server rejected it), the mutation is queued for later instead
 * of surfacing an error to the user.
 */
export async function submitOrQueue(kind: string, path: string, method: "POST" | "PATCH", body: unknown): Promise<{ queued: boolean }> {
  try {
    await apiFetch(path, { method, body: JSON.stringify(body) });
    return { queued: false };
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

/** Flushes queued mutations in order, stopping at the first failure so nothing is skipped or reordered. */
export async function flushQueue(): Promise<{ flushed: number; remaining: number }> {
  const items = await listQueued();
  let flushed = 0;
  for (const item of items) {
    try {
      await apiFetch(item.path, { method: item.method, body: JSON.stringify(item.body) });
      await removeQueued(item.id);
      flushed++;
    } catch {
      break;
    }
  }
  const remaining = (await listQueued()).length;
  return { flushed, remaining };
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
    return () => window.removeEventListener("online", flush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pendingCount, flushing, refresh, flush };
}
