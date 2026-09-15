import * as SQLite from "expo-sqlite";

const DB_NAME = "cantero-offline.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** The web client keeps the same two stores in IndexedDB (apps/web/lib/offline-db.ts); SQLite is
 * the equivalent here, and gives the queue an ordered autoincrement key for free. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
    // WAL keeps a flush in progress from blocking reads by the screens rendering the queue state.
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS mutations (
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
      );
    `);
    return db;
  });
  return dbPromise;
}

/** Wipes every queued (unsynced) mutation and every cached response — called when the signed-in
 * account changes (see api-client.ts), so a phone handed to another worker never replays one
 * account's queued writes, or shows its cached reads, under another's session. Best-effort: a
 * failure here must not block the login that triggered it. */
export async function clearOfflineData(): Promise<void> {
  try {
    const db = await getDb();
    await db.execAsync("DELETE FROM mutations; DELETE FROM cache;");
  } catch {
    // a corrupt or locked database shouldn't break signing in
  }
}
