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
    /** What the server actually said, when `message` is our translated stand-in for it. */
    public serverMessage: string = message,
  ) {
    super(message);
    this.name = "ApiError";
  }
  /** Already shown to the user (apiFetch toasts failed writes itself) — see notifyApiError. */
  notified = false;
}

/**
 * For the `.catch()` of a request whose failure has no inline place to show: tells the user in a
 * toast, unless apiFetch already did (a failed write) — so nothing is shown twice and no rejection
 * goes unhandled. An aborted request (the component moved on) is not a failure.
 */
export function notifyApiError(err: unknown): void {
  if (err instanceof ApiError && err.notified) return;
  if (err instanceof DOMException && err.name === "AbortError") return;
  notifyError?.(err instanceof Error && err.message ? err.message : genericMessage("server"));
}

export type ApiErrorKey = "network" | "server" | "forbidden" | "unauthorized" | "tooManyRequests" | "notFound" | "badRequest";

const ENGLISH_ERRORS: Record<ApiErrorKey, string> = {
  network: "Can't reach the server. Check your connection and try again.",
  server: "Something went wrong on our side. Please try again in a moment.",
  forbidden: "You don't have access to this.",
  unauthorized: "Your session has expired. Please sign in again.",
  tooManyRequests: "Too many attempts. Please wait a moment and try again.",
  notFound: "This item doesn't exist or is no longer available.",
  badRequest: "This request couldn't be processed.",
};

/** The generic error texts in the viewer's language (messages: apiErrors.*). Registered from
 * inside the i18n provider by components/api-error-messages.tsx — English until then. */
let translateError: ((key: ApiErrorKey) => string) | null = null;
export function setApiErrorTranslator(translator: ((key: ApiErrorKey) => string) | null): ((key: ApiErrorKey) => string) | null {
  const previous = translateError;
  translateError = translator;
  return previous;
}

function genericMessage(key: ApiErrorKey): string {
  try {
    return translateError?.(key) ?? ENGLISH_ERRORS[key];
  } catch {
    return ENGLISH_ERRORS[key];
  }
}

/** fetch() failed before any response (offline, DNS, CORS). Still a TypeError — the offline
 * queue (lib/offline-queue.ts) tells "queue it" from "the server said no" by exactly that — but
 * with a message a person can read, in their language. */
export class NetworkError extends TypeError {
  constructor() {
    super(genericMessage("network"));
    this.name = "NetworkError";
  }
}

/** Framework default texts that say nothing a person can act on (Nest's exception defaults,
 * the throttler, the auth guard). Anything else the API wrote on purpose is shown as is. */
const GENERIC_SERVER_MESSAGES = new Set([
  "",
  "Unauthorized",
  "Forbidden",
  "Forbidden resource",
  "Not Found",
  "Bad Request",
  "Internal Server Error",
  "Internal server error",
  "Too Many Requests",
  "ThrottlerException: Too Many Requests",
  "Missing bearer token",
]);

/** The text to show for a failed response: 5xx, 429 and the framework's generic 4xx texts become
 * translated messages, a role/permission refusal becomes "no access", and a specific message the
 * API wrote (validation, business rules) is kept. */
export function userFacingErrorMessage(status: number, serverMessage: string, statusText = ""): string {
  if (status >= 500) return genericMessage("server");
  if (status === 429) return genericMessage("tooManyRequests");
  const generic =
    GENERIC_SERVER_MESSAGES.has(serverMessage) || serverMessage === statusText || /^Cannot (GET|POST|PUT|PATCH|DELETE) \//.test(serverMessage);
  if (status === 403 && (generic || /^Requires (the "|one of these roles)/.test(serverMessage))) return genericMessage("forbidden");
  if (status === 401 && generic) return genericMessage("unauthorized");
  if (!generic) return serverMessage;
  return genericMessage(status === 404 ? "notFound" : "badRequest");
}

/** Builds the ApiError for a non-2xx response (reads the JSON body's `message` when there is one). */
export async function readApiError(res: Response): Promise<ApiError> {
  let serverMessage = res.statusText;
  try {
    const body = await res.json();
    serverMessage = Array.isArray(body?.message) ? body.message.join(", ") : (body?.message ?? serverMessage);
  } catch {
    // response wasn't JSON; keep statusText
  }
  return new ApiError(res.status, userFacingErrorMessage(res.status, serverMessage, res.statusText), serverMessage);
}

/** fetch() for API calls: tells the API the viewer's language (Accept-Language, from <html lang>)
 * and turns a network failure into a NetworkError. */
export async function sendApiRequest(url: string, init: RequestInit & { headers?: Record<string, string> }): Promise<Response> {
  const lang = typeof document !== "undefined" ? document.documentElement.lang : "";
  const headers = lang && !init.headers?.["Accept-Language"] ? { ...init.headers, "Accept-Language": lang } : init.headers;
  try {
    return await fetch(url, { ...init, headers });
  } catch (err) {
    if (err instanceof TypeError) throw new NetworkError();
    throw err;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await sendApiRequest(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const error = await readApiError(res);
    // Only user-initiated writes get an automatic toast — several GET call sites deliberately
    // treat a 404 as a normal "not found yet" outcome (e.g. no company logo uploaded) via their
    // own .catch(), and toasting those would turn an expected empty state into a false alarm.
    const method = (options.method ?? "GET").toUpperCase();
    if (method !== "GET" && notifyError) {
      notifyError(error.message);
      error.notified = true;
    }
    throw error;
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

  const res = await sendApiRequest(`${API_URL}${path}`, { method: "POST", headers, body: formData });
  if (!res.ok) {
    const error = await readApiError(res);
    if (notifyError) {
      notifyError(error.message);
      error.notified = true;
    }
    throw error;
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
