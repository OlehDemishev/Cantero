"use client";

import { currentAccount } from "./account";

/**
 * This device's offline data, one IndexedDB database per (user, company): the writes a person made
 * without a connection stay theirs until they sync, even when a colleague signs in on the same
 * tablet in between — the colleague neither sees them nor sends them under their own name, and
 * they go out the next time their owner signs in. Cached reads, which are only a copy of what the
 * server has, are dropped when the account changes (see forgetCachedReads).
 */
const DB_PREFIX = "cantero-offline:";
const DB_VERSION = 2;
/** The single shared database used before offline data was kept per account. */
const LEGACY_DB_NAME = "cantero-offline";
/** Accounts that have used this device, with the name to show when their writes are still waiting. */
const ACCOUNTS_KEY = "cantero_offline_accounts";

export const MUTATIONS_STORE = "mutations";
export const CACHE_STORE = "cache";

const connections = new Map<string, Promise<IDBDatabase>>();

function dbName(accountKey: string | null): string {
  return DB_PREFIX + (accountKey ?? "signed-out");
}

/** One long-lived connection per database, closed when another tab upgrades or deletes it (so that
 * doesn't sit blocked). */
function openDb(name: string): Promise<IDBDatabase> {
  const open = connections.get(name);
  if (open) return open;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MUTATIONS_STORE)) db.createObjectStore(MUTATIONS_STORE, { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE, { keyPath: "key" });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        connections.delete(name);
      };
      resolve(db);
    };
    req.onerror = () => {
      connections.delete(name);
      reject(req.error);
    };
  });
  connections.set(name, opening);
  return opening;
}

let legacyDropped = false;
/** No deployment ever kept data in the shared database worth carrying over, so it's simply removed. */
function dropLegacyDb(): void {
  if (legacyDropped) return;
  legacyDropped = true;
  try {
    indexedDB.deleteDatabase(LEGACY_DB_NAME);
  } catch {
    // best-effort
  }
}

function runIn<T>(db: IDBDatabase, storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Runs one request against the signed-in account's own offline database. */
export async function withStore<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  dropLegacyDb();
  return runIn(await openDb(dbName(currentAccount()?.key ?? null)), storeName, mode, fn);
}

/**
 * Called when a different account signs in on this device (api-client.ts setToken): drops the
 * previous account's cached reads, keeps its unsent writes for when it signs in again.
 */
export async function forgetCachedReads(accountKey: string): Promise<void> {
  try {
    await runIn(await openDb(dbName(accountKey)), CACHE_STORE, "readwrite", (store) => store.clear());
  } catch {
    // best-effort — a blocked store shouldn't break the login that triggered it
  }
}

interface KnownAccount {
  name: string;
  companyName?: string;
}

function knownAccounts(): Record<string, KnownAccount> {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "{}") as Record<string, KnownAccount>;
  } catch {
    return {};
  }
}

/** Remembers who the signed-in account is, so a colleague on this device can be told whose writes are waiting. */
export function rememberAccount(accountKey: string, name: string, companyName?: string): void {
  try {
    const all = knownAccounts();
    if (all[accountKey]?.name === name && all[accountKey]?.companyName === companyName) return;
    all[accountKey] = { name, companyName };
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(all));
  } catch {
    // storage full or disabled — only the notice loses its name
  }
}

export interface WaitingElsewhere {
  accountKey: string;
  name: string;
  companyName?: string;
  count: number;
}

/** Other accounts' writes still waiting on this device, to show the person signed in now. */
export async function unsentForOtherAccounts(): Promise<WaitingElsewhere[]> {
  const current = currentAccount()?.key;
  const waiting: WaitingElsewhere[] = [];
  for (const [accountKey, known] of Object.entries(knownAccounts())) {
    if (accountKey === current) continue;
    try {
      const count = await runIn(await openDb(dbName(accountKey)), MUTATIONS_STORE, "readonly", (store) => store.count());
      if (count > 0) waiting.push({ accountKey, name: known.name, companyName: known.companyName, count });
    } catch {
      // unreadable store: nothing to report
    }
  }
  return waiting;
}
