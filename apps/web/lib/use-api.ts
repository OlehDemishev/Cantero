"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { apiFetch } from "./api-client";
import { fetchCached } from "./offline-cache";

export interface UseApiOptions {
  /** Read through the offline cache (lib/offline-cache.ts) under this key: every answer is stored
   * for offline viewing, and while the device is offline the last stored answer is served instead
   * of an error (`stale` is then true). */
  cacheKey?: string;
  /** While a changed path (another filter, a search) loads, keep showing the previous path's data
   * instead of none — for refining one list, not for switching to another record or project. A
   * string scopes it: the previous data is kept only if it was loaded under the same string (pass
   * the project id, say, so a filter change keeps the rows but a project change doesn't). */
  keepPrevious?: boolean | string;
}

export interface UseApiResult<T> {
  /** The latest answer for the current path — undefined until it arrives, after a failed first
   * load, and right after the path changes (a previous path's answer is not shown for the new one,
   * unless `keepPrevious`). */
  data: T | undefined;
  /** Why the last load failed (an ApiError carries the status), or null. A failed `reload` keeps
   * the data already on screen and sets this too — render `data` first, then the error. */
  error: Error | null;
  /** True while the first answer for the current path is on its way. */
  loading: boolean;
  /** True while a `reload` is refreshing data already on screen. */
  validating: boolean;
  /** The answer came from the offline cache, not the server (only with `cacheKey`). */
  stale: boolean;
  /** When the answer was fetched (only with `cacheKey`). */
  cachedAt: number | null;
  /** Fetches the path again, keeping the current data on screen meanwhile. Never rejects: a failure
   * lands in `error`. */
  reload: () => Promise<void>;
  /** Changes the data locally (an optimistic update, an item the server just returned). */
  setData: Dispatch<SetStateAction<T | undefined>>;
}

interface Answer<T> {
  data: T;
  cachedAt: number | null;
  stale: boolean;
}

interface InFlight {
  promise: Promise<Answer<unknown>>;
  controller: AbortController;
  users: number;
}

/** GETs on their way, by request key — a second component asking for the same path while the
 * first answer is pending shares that request instead of sending its own. */
const inFlight = new Map<string, InFlight>();
/** Everyone currently showing a request key, told when any of them receives a newer answer. */
const listeners = new Map<string, Set<(answer: Answer<unknown>) => void>>();

function requestKey(path: string, cacheKey: string | undefined): string {
  return cacheKey ? `${cacheKey}\u0000${path}` : path;
}

/** Joins the pending request for `key` (or starts one; `fresh` always starts one, for a reload
 * after a change). `release` leaves it; the request is aborted once nobody waits for it any more. */
function request<T>(key: string, path: string, cacheKey: string | undefined, fresh: boolean): { promise: Promise<Answer<T>>; release: () => void } {
  let entry = fresh ? undefined : inFlight.get(key);
  if (!entry) {
    const controller = new AbortController();
    const promise: Promise<Answer<unknown>> = cacheKey
      ? fetchCached<unknown>(cacheKey, path, { signal: controller.signal })
      : apiFetch<unknown>(path, { signal: controller.signal }).then((data) => ({ data, cachedAt: null, stale: false }));
    const created: InFlight = { promise, controller, users: 0 };
    const settle = () => {
      if (inFlight.get(key) === created) inFlight.delete(key);
    };
    promise.then((answer) => {
      settle();
      listeners.get(key)?.forEach((listener) => listener(answer));
    }, settle);
    inFlight.set(key, created);
    entry = created;
  }
  const joined = entry;
  joined.users += 1;
  let released = false;
  return {
    promise: joined.promise as Promise<Answer<T>>,
    release: () => {
      if (released) return;
      released = true;
      joined.users -= 1;
      if (joined.users === 0) {
        joined.controller.abort();
        if (inFlight.get(key) === joined) inFlight.delete(key);
      }
    },
  };
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

interface State<T> {
  key: string | null;
  data: T | undefined;
  error: Error | null;
  validating: boolean;
  stale: boolean;
  cachedAt: number | null;
  /** The keepPrevious scope the data was loaded under. */
  scope: string | null;
}

const EMPTY: State<never> = { key: null, data: undefined, error: null, validating: false, stale: false, cachedAt: null, scope: null };

/**
 * Loads a GET path for a component: `{ data, error, loading, reload, setData }`. Identical GETs from
 * several components at once share one request; switching to another path (another project, say)
 * aborts the previous request and never shows its answer; unmounting aborts too. Pass `null` to load
 * nothing (no id yet, or the member lacks the permission). Errors never escape as unhandled
 * rejections — they are in `error`, ready for <ErrorState>.
 */
export function useApi<T>(path: string | null, options: UseApiOptions = {}): UseApiResult<T> {
  const { cacheKey, keepPrevious = false } = options;
  const key = path === null ? null : requestKey(path, cacheKey);
  const scope = keepPrevious === false ? null : keepPrevious === true ? "" : keepPrevious;
  const [state, setState] = useState<State<T>>(EMPTY);
  /** The key this component is showing right now (as of the last commit) and the reloads it has
   * pending, so answers for a key it has moved on from are dropped and its requests let go. */
  const current = useRef<{ key: string | null; scope: string | null; releases: Set<() => void> }>({ key: null, scope: null, releases: new Set() });

  const accept = useCallback((forKey: string, answer: Answer<T>) => {
    if (current.current.key !== forKey) return;
    setState({
      key: forKey,
      data: answer.data,
      error: null,
      validating: false,
      stale: answer.stale,
      cachedAt: answer.cachedAt,
      scope: current.current.scope,
    });
  }, []);

  useEffect(() => {
    const mine = { key, scope, releases: new Set<() => void>() };
    current.current = mine;
    if (key === null || path === null) return;
    const listener = (answer: Answer<unknown>) => accept(key, answer as Answer<T>);
    let subscribers = listeners.get(key);
    if (!subscribers) listeners.set(key, (subscribers = new Set()));
    subscribers.add(listener);
    const { promise, release } = request<T>(key, path, cacheKey, false);
    mine.releases.add(release);
    // A success reaches this component through its listener above, like everyone else showing the key.
    promise.catch((err) => {
      if (isAbort(err) || current.current !== mine) return;
      setState((s) => (s.key === key && s.data !== undefined ? { ...s, error: toError(err), validating: false } : { ...EMPTY, key, error: toError(err) }));
    });
    return () => {
      subscribers.delete(listener);
      if (subscribers.size === 0) listeners.delete(key);
      mine.releases.forEach((r) => r());
      mine.releases.clear();
      if (current.current === mine) current.current = { key: null, scope: null, releases: new Set() };
    };
  }, [key, path, cacheKey, scope, accept]);

  const reload = useCallback(async () => {
    if (key === null || path === null) return;
    const mine = current.current;
    if (mine.key !== key) return;
    setState((s) => (s.key === key ? { ...s, validating: true } : s));
    const { promise, release } = request<T>(key, path, cacheKey, true);
    mine.releases.add(release);
    try {
      await promise; // the answer itself arrives through the listener, before this resumes
    } catch (err) {
      if (!isAbort(err) && current.current === mine) {
        setState((s) => (s.key === key ? { ...s, error: toError(err), validating: false } : { ...EMPTY, key, error: toError(err) }));
      }
    } finally {
      mine.releases.delete(release);
      release();
    }
  }, [key, path, cacheKey]);

  const setData = useCallback<Dispatch<SetStateAction<T | undefined>>>(
    (value) =>
      setState((s) => {
        const base = s.key === key ? s : { ...EMPTY, key };
        const data = typeof value === "function" ? (value as (prev: T | undefined) => T | undefined)(base.data) : value;
        return { ...base, data };
      }),
    [key],
  );

  const own = state.key === key && key !== null;
  return {
    data: own || (key !== null && scope !== null && state.scope === scope) ? state.data : undefined,
    error: own ? state.error : null,
    loading: key !== null && (!own || (state.data === undefined && state.error === null)),
    validating: own && state.validating,
    stale: own && state.stale,
    cachedAt: own ? state.cachedAt : null,
    reload,
    setData,
  };
}
