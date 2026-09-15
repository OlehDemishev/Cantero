import { apiFetch, NetworkError } from "./api-client";
import { getDb } from "./offline-db";

interface CacheRow {
  data: string;
  cachedAt: number;
}

/** Also used to keep the cache in step with an optimistic local update, so reopening the app while
 * still offline doesn't revert it. */
export async function updateCache<T>(key: string, data: T): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO cache (key, data, cachedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, cachedAt = excluded.cachedAt",
    key,
    JSON.stringify(data),
    Date.now(),
  );
}

async function getCached<T>(key: string): Promise<{ data: T; cachedAt: number } | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<CacheRow>("SELECT data, cachedAt FROM cache WHERE key = ?", key);
  if (!row) return null;
  try {
    return { data: JSON.parse(row.data) as T, cachedAt: row.cachedAt };
  } catch {
    return null;
  }
}

/**
 * Fetches fresh data and caches it for offline viewing; if the request fails because the device is
 * offline, falls back to the last cached value instead of throwing. A server error still throws —
 * only a NetworkError (no response at all) is treated as "show what we have".
 */
export async function fetchCached<T>(
  key: string,
  path: string,
): Promise<{ data: T; cachedAt: number | null; stale: boolean }> {
  try {
    const data = await apiFetch<T>(path);
    updateCache(key, data).catch(() => {});
    return { data, cachedAt: Date.now(), stale: false };
  } catch (err) {
    if (err instanceof NetworkError) {
      const cached = await getCached<T>(key);
      if (cached) return { data: cached.data, cachedAt: cached.cachedAt, stale: true };
    }
    throw err;
  }
}
