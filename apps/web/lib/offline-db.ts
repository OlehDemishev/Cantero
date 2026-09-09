"use client";

const DB_NAME = "cantero-offline";
const DB_VERSION = 2;

export const MUTATIONS_STORE = "mutations";
export const CACHE_STORE = "cache";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MUTATIONS_STORE)) {
        db.createObjectStore(MUTATIONS_STORE, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Wipes every queued (unsynced) mutation and every cached API response — called when the signed-in
 * account changes (see api-client.ts's setToken), so a device shared or reused across accounts
 * never replays one account's queued writes, or shows one account's cached reads, under another's
 * session. Best-effort: a failure here shouldn't block the login that triggered it. */
export function clearOfflineData(): void {
  try {
    indexedDB.deleteDatabase(DB_NAME);
  } catch {
    // best-effort — a private-browsing context or a blocked store shouldn't break login
  }
}
