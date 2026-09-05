export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TOKEN_KEY = "cantero_token";

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
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
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
    contentType.includes("text/csv") ||
    contentType.startsWith("image/")
  ) {
    return (await res.blob()) as unknown as T;
  }
  return res.json() as Promise<T>;
}

/** Multipart upload — browser sets the Content-Type boundary itself, so no JSON header here. */
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

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
