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

/** Wipes every queued (unsynced) mutation and every cached response — called when the signed-in
 * account changes (see api-client.ts), so a phone handed to another worker never replays one
 * account's queued writes, or shows its cached reads, under another's session. Best-effort: a
 * failure here must not block the login that triggered it. Queued photo files go too. */
export async function clearOfflineData(): Promise<void> {
  try {
    const db = await getDb();
    await db.execAsync("DELETE FROM mutations; DELETE FROM cache; DELETE FROM results;");
  } catch {
    // a corrupt or locked database shouldn't break signing in
  }
  try {
    const { clearQueuedFiles } = await import("./photos");
    clearQueuedFiles();
    const { clearDownloadedSheets } = await import("./sheets");
    clearDownloadedSheets();
  } catch {
    // same: best effort
  }
}
