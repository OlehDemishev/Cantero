import * as SQLite from "expo-sqlite";

const DB_NAME = "cantero-offline.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Schema changes, applied in order and tracked in PRAGMA user_version so an installed app upgrades
 * its existing queue instead of losing it. Append only — never edit a step that has shipped.
 */
const MIGRATIONS: string[] = [
  // 1: the original queue and read cache (same two stores the web client keeps in IndexedDB).
  `CREATE TABLE IF NOT EXISTS mutations (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     mutationId TEXT NOT NULL,
     kind TEXT NOT NULL,
     path TEXT NOT NULL,
     method TEXT NOT NULL,
     body TEXT,
     createdAt INTEGER NOT NULL,
     error TEXT
   );
   CREATE TABLE IF NOT EXISTS cache (
     key TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     cachedAt INTEGER NOT NULL
   );`,
  // 2: queued file uploads (photos), which may depend on a record queued before them — see
  // offline-queue.ts — and the ids the server gave delivered records, to fill those dependencies in.
  `ALTER TABLE mutations ADD COLUMN fileUri TEXT;
   ALTER TABLE mutations ADD COLUMN fileName TEXT;
   ALTER TABLE mutations ADD COLUMN fileType TEXT;
   ALTER TABLE mutations ADD COLUMN dependsOn TEXT;
   CREATE TABLE IF NOT EXISTS results (
     mutationId TEXT PRIMARY KEY,
     entityId TEXT NOT NULL,
     createdAt INTEGER NOT NULL
   );`,
  // 3: whose each queued write is ("<userId>:<companyId>"), so a colleague signing in on the same
  // phone neither sends it nor loses it; and the names to tell them whose writes are waiting.
  `ALTER TABLE mutations ADD COLUMN owner TEXT;
   CREATE TABLE IF NOT EXISTS accounts (
     key TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     companyName TEXT
   );`,
];

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
    // WAL keeps a flush in progress from blocking reads by the screens rendering the queue state.
    await db.execAsync("PRAGMA journal_mode = WAL;");
    const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
    // Databases created before versioning have the v1 tables but user_version 0; v1 is written with
    // IF NOT EXISTS, so re-running it on them is harmless.
    for (let v = row?.user_version ?? 0; v < MIGRATIONS.length; v++) {
      await db.withTransactionAsync(async () => {
        await db.execAsync(MIGRATIONS[v]);
        await db.execAsync(`PRAGMA user_version = ${v + 1}`);
      });
    }
    return db;
  });
  return dbPromise;
}

/**
 * Called when a different account signs in on this phone (api-client.ts setToken): drops what was
 * only a copy of the server's data — cached reads and downloaded drawing sheets. The previous
 * account's unsent writes, and the photos queued with them, stay until that account signs in again
 * (offline-queue.ts only sends the signed-in account's own). Best-effort: a failure here must not
 * block the login that triggered it.
 */
export async function forgetCachedReads(): Promise<void> {
  try {
    const db = await getDb();
    await db.execAsync("DELETE FROM cache;");
  } catch {
    // a corrupt or locked database shouldn't break signing in
  }
  try {
    const { clearDownloadedSheets } = await import("./sheets");
    clearDownloadedSheets();
  } catch {
    // best-effort
  }
}

/** Remembers the signed-in account's name, so a colleague can be told whose writes are waiting. */
export async function rememberAccount(key: string, name: string, companyName?: string): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync("INSERT OR REPLACE INTO accounts (key, name, companyName) VALUES (?, ?, ?)", key, name, companyName ?? null);
  } catch {
    // only the notice loses its name
  }
}

export interface WaitingElsewhere {
  accountKey: string;
  name: string | null;
  companyName: string | null;
  count: number;
}

/** Other accounts' writes still waiting on this phone. */
export async function unsentForOtherAccounts(currentKey: string | null): Promise<WaitingElsewhere[]> {
  const db = await getDb();
  return db.getAllAsync<WaitingElsewhere>(
    `SELECT m.owner AS accountKey, a.name AS name, a.companyName AS companyName, COUNT(*) AS count
       FROM mutations m LEFT JOIN accounts a ON a.key = m.owner
      WHERE m.owner IS NOT NULL AND m.owner != ?
      GROUP BY m.owner, a.name, a.companyName`,
    currentKey ?? "",
  );
}
