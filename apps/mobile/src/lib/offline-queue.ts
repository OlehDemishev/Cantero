import { useCallback, useEffect, useState } from "react";
import { addNetworkStateListener, getNetworkStateAsync } from "expo-network";
import { ApiError, apiFetch, apiUpload, NetworkError, type UploadFile } from "./api-client";
import { getDb } from "./offline-db";
import { deletePhoto } from "./photos";

/** Stands in for the id of the record a queued upload belongs to, until that record is delivered. */
export const PARENT_ID = ":parentId";

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
  /** Set for a queued file upload: the file, kept on disk until it's delivered. */
  file?: UploadFile;
  /** mutationId of a queued record this upload belongs to — e.g. a photo taken for a punch item
   * that was itself created offline. `path` then contains PARENT_ID, replaced by that record's id
   * once it has been delivered. */
  dependsOn?: string;
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
  fileUri: string | null;
  fileName: string | null;
  fileType: string | null;
  dependsOn: string | null;
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
    ...(row.fileUri ? { file: { uri: row.fileUri, name: row.fileName ?? "upload", type: row.fileType ?? "application/octet-stream" } } : {}),
    ...(row.dependsOn ? { dependsOn: row.dependsOn } : {}),
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
  dependsOn?: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO mutations (mutationId, kind, path, method, body, createdAt, dependsOn) VALUES (?, ?, ?, ?, ?, ?, ?)",
    mutationId,
    kind,
    path,
    method,
    JSON.stringify(body),
    Date.now(),
    dependsOn ?? null,
  );
  notifyQueueChanged();
}

async function queueUpload(kind: string, path: string, file: UploadFile, mutationId: string, dependsOn?: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO mutations (mutationId, kind, path, method, body, createdAt, fileUri, fileName, fileType, dependsOn) VALUES (?, ?, ?, 'POST', NULL, ?, ?, ?, ?, ?)",
    mutationId,
    kind,
    path,
    Date.now(),
    file.uri,
    file.name,
    file.type,
    dependsOn ?? null,
  );
  notifyQueueChanged();
}

async function removeQueued(id: number): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ fileUri: string | null }>("SELECT fileUri FROM mutations WHERE id = ?", id);
  await db.runAsync("DELETE FROM mutations WHERE id = ?", id);
  if (row?.fileUri) deletePhoto(row.fileUri);
  notifyQueueChanged();
}

/** Remembers the id the server gave a delivered record, for uploads queued against it. */
async function recordResult(mutationId: string, data: unknown): Promise<void> {
  const id = (data as { id?: unknown } | null | undefined)?.id;
  if (typeof id !== "string") return;
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO results (mutationId, entityId, createdAt) VALUES (?, ?, ?)", mutationId, id, Date.now());
  // Nothing depends on a result for long: a dependent upload is delivered in the same flush.
  await db.runAsync("DELETE FROM results WHERE createdAt < ?", Date.now() - 30 * 24 * 60 * 60 * 1000);
}

async function resultFor(mutationId: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ entityId: string }>("SELECT entityId FROM results WHERE mutationId = ?", mutationId);
  return row?.entityId ?? null;
}

/** Thrown when a queued upload's record never reached the server (it was rejected or discarded). */
class OrphanedUploadError extends Error {}

async function markFailed(id: number, error: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE mutations SET error = ? WHERE id = ?", error, id);
  notifyQueueChanged();
}

/** Discards a mutation the server rejected — the user's explicit "give up on this one". Photos
 * queued for that record go with it: they have nothing left to attach to. */
export async function discardQueued(id: number): Promise<void> {
  const items = await listQueued();
  const item = items.find((i) => i.id === id);
  if (!item) return;
  for (const dependent of items.filter((i) => i.dependsOn === item.mutationId)) await removeQueued(dependent.id);
  await removeQueued(id);
}

async function deliver(item: QueuedMutation): Promise<void> {
  let path = item.path;
  if (item.dependsOn) {
    const parentId = await resultFor(item.dependsOn);
    if (!parentId) {
      const parentQueued = (await listQueued()).some((i) => i.mutationId === item.dependsOn);
      // Still queued: it simply hasn't gone yet (it's always ahead of this item, so a flush that
      // reached here found it rejected). Not queued and no result: it was discarded.
      throw new OrphanedUploadError(parentQueued ? "Waiting for the record this belongs to, which the server rejected" : "The record this belongs to was discarded");
    }
    path = path.replace(PARENT_ID, encodeURIComponent(parentId));
  }
  const data = item.file
    ? await apiUpload(path, item.file, item.mutationId)
    : await apiFetch(path, { method: item.method, body: JSON.stringify(item.body), headers: { "Idempotency-Key": item.mutationId } });
  await recordResult(item.mutationId, data);
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
    if (err instanceof NetworkError) return { ok: false, error: err.message };
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
): Promise<{ queued: boolean; data?: T; mutationId?: string }> {
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
      return { queued: true, mutationId };
    }
    throw err;
  }
}

/**
 * Uploads a file now, or queues it when offline. The file must already be somewhere that survives
 * until upload (photos.ts puts captured photos there); it's deleted once delivered.
 */
export async function submitOrQueueUpload<T = unknown>(kind: string, path: string, file: UploadFile): Promise<{ queued: boolean; data?: T }> {
  const mutationId = newMutationId();
  try {
    const data = await apiUpload<T>(path, file, mutationId);
    deletePhoto(file.uri);
    return { queued: false, data };
  } catch (err) {
    if (err instanceof NetworkError) {
      await queueUpload(kind, path, file, mutationId);
      return { queued: true };
    }
    throw err;
  }
}

/**
 * A second write about a record just submitted with submitOrQueue — e.g. pinning a new punch item
 * to a drawing, which the create endpoint doesn't take. Sent now when the record exists, queued
 * behind it when the record itself is still queued. `pathFor` builds the path from its id.
 */
export async function followUp(
  kind: string,
  record: { queued: boolean; data?: unknown; mutationId?: string },
  method: "POST" | "PATCH",
  pathFor: (recordId: string) => string,
  body: unknown,
): Promise<{ queued: boolean }> {
  const recordId = (record.data as { id?: unknown } | undefined)?.id;
  if (!record.queued && typeof recordId === "string") return submitOrQueue(kind, pathFor(recordId), method, body);
  if (record.queued && record.mutationId) {
    await queueMutation(kind, pathFor(PARENT_ID), method, body, newMutationId(), record.mutationId);
    return { queued: true };
  }
  throw new Error("The record has no id to follow up on");
}

/**
 * Attaches photos to a record that was just submitted with submitOrQueue: uploaded straight away
 * when the record exists, queued behind it when the record itself is still queued. `pathFor`
 * builds the upload path from the record's id.
 */
export async function attachFiles(
  kind: string,
  record: { queued: boolean; data?: unknown; mutationId?: string },
  files: UploadFile[],
  pathFor: (recordId: string) => string,
): Promise<{ queued: number; failed: number }> {
  let queued = 0;
  let failed = 0;
  const recordId = (record.data as { id?: unknown } | undefined)?.id;
  for (const file of files) {
    try {
      if (!record.queued && typeof recordId === "string") {
        if ((await submitOrQueueUpload(kind, pathFor(recordId), file)).queued) queued++;
      } else if (record.queued && record.mutationId) {
        await queueUpload(kind, pathFor(PARENT_ID), file, newMutationId(), record.mutationId);
        queued++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }
  return { queued, failed };
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
        if (err instanceof ApiError || err instanceof OrphanedUploadError) {
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
