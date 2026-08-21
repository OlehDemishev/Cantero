"use client";

import { apiFetch } from "./api-client";
import { withStore, CACHE_STORE } from "./offline-db";

interface CacheEntry<T> {
  key: string;
  data: T;
  cachedAt: number;
}

async function getCached<T>(key: string): Promise<CacheEntry<T> | undefined> {
  return withStore<CacheEntry<T> | undefined>(CACHE_STORE, "readonly", (store) => store.get(key));
}

/** Also used to keep the cache in sync with an optimistic local update, so a page reload while still offline doesn't revert it. */
export async function updateCache<T>(key: string, data: T): Promise<void> {
  await withStore(CACHE_STORE, "readwrite", (store) => store.put({ key, data, cachedAt: Date.now() } as CacheEntry<T>));
}

/**
 * Fetches fresh data and caches it for offline viewing; if the request fails because the
 * device is offline, falls back to the last cached value (if any) instead of throwing.
 */
export async function fetchCached<T>(key: string, path: string): Promise<{ data: T; cachedAt: number | null; stale: boolean }> {
  try {
    const data = await apiFetch<T>(path);
    updateCache(key, data).catch(() => {});
    return { data, cachedAt: Date.now(), stale: false };
  } catch (err) {
    if (err instanceof TypeError) {
      const cached = await getCached<T>(key);
      if (cached) return { data: cached.data, cachedAt: cached.cachedAt, stale: true };
    }
    throw err;
  }
}
