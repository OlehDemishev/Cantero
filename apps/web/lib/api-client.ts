import { TOKEN_KEY, accountOf } from "./account";
import { forgetCachedReads } from "./offline-db";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
/** Whose session was last signed in on this device (see offline-db.ts) — deliberately NOT cleared
 * on logout, only compared and overwritten on the next setToken(), so an account switch on a shared
 * device is noticed even across a sign-out. */
const ACCOUNT_KEY = "cantero_account";

/**
 * A plain function (not a hook) needs a way to reach the toast UI, which lives inside React —
 * ToastProvider registers itself here on mount. Without this, a failed request whose caller
 * doesn't have its own error-handling code fails completely silently (the historical default
 * across most of this codebase's ~150 components) rather than telling the user anything at all.
 */
let notifyError: ((message: string) => void) | null = null;
export function setApiErrorListener(listener: ((message: string) => void) | null): void {
  notifyError = listener;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  const previous = localStorage.getItem(ACCOUNT_KEY);
  const next = accountOf(token)?.key ?? null;
  if (next && previous && previous !== next) {
    // Another person, or the same person in another company: their cached reads go, their unsent
    // writes stay in their own store until they sign in again.
    void forgetCachedReads(previous);
    // The service worker's own API response cache (public/sw.js) is keyed by request, not by
    // account, and has no way to notice this switch on its own — tell it directly. No-op if no
    // worker is controlling this page yet (nothing would be cached for it to serve anyway).
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_API_CACHE" });
  }
  if (next) localStorage.setItem(ACCOUNT_KEY, next);
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** How long sign-out waits for the API before going ahead locally anyway. */
const LOGOUT_TIMEOUT_MS = 3000;

/**
 * The "Sign out" button: ends the session on the server, wipes this account's cached API reads
 * (the IndexedDB read cache and the service worker's /api/ cache) so the next person on a shared
 * device can't browse them offline, then forgets the token. The server call is best effort —
 * offline or an unreachable API never keeps anyone signed in here. Queued unsent writes are kept
 * on purpose: they stay in this account's own store and go out on its next sign-in.
 */
export async function signOutSession(): Promise<void> {
  const token = getToken();
  if (token) {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(LOGOUT_TIMEOUT_MS),
      });
    } catch {
      // offline or timed out — the token is still dropped below
    }
  }
  const account = accountOf(token);
  await Promise.all([account ? forgetCachedReads(account.key) : undefined, clearApiResponseCache()]);
  clearToken();
}

/** Deletes the service worker's API response cache (public/sw.js API_CACHE, "<version>-api") from
 * the page itself, so it works whether or not a worker controls this tab right now. */
async function clearApiResponseCache(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.endsWith("-api")).map((name) => caches.delete(name)));
  } catch {
    // Cache Storage unavailable (private mode, insecure origin) — nothing was cached there then
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = Array.isArray(body?.message) ? body.message.join(", ") : (body?.message ?? message);
    } catch {
      // response wasn't JSON; keep statusText
    }
    // Only user-initiated writes get an automatic toast — several GET call sites deliberately
    // treat a 404 as a normal "not found yet" outcome (e.g. no company logo uploaded) via their
    // own .catch(), and toasting those would turn an expected empty state into a false alarm.
    const method = (options.method ?? "GET").toUpperCase();
    if (method !== "GET") notifyError?.(message);
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/pdf") ||
    contentType.includes("application/octet-stream") ||
    contentType.includes("application/timestamp-reply") ||
    contentType.includes("application/xml") ||
    contentType.includes("text/csv") ||
    contentType.startsWith("image/")
  ) {
    return (await res.blob()) as unknown as T;
  }
  return res.json() as Promise<T>;
}

/** Multipart upload — browser sets the Content-Type boundary itself, so no JSON header here. */
export async function apiUpload<T>(path: string, file: File, idempotencyKey?: string): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}${path}`, { method: "POST", headers, body: formData });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = Array.isArray(body?.message) ? body.message.join(", ") : (body?.message ?? message);
    } catch {
      // ignore
    }
    notifyError?.(message);
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
