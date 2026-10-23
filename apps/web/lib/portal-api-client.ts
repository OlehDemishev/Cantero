import { readApiError, sendApiRequest } from "./api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const PORTAL_TOKEN_KEY = "cantero_portal_token";

export function getPortalToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PORTAL_TOKEN_KEY);
}

export function setPortalToken(token: string): void {
  localStorage.setItem(PORTAL_TOKEN_KEY, token);
}

export function clearPortalToken(): void {
  localStorage.removeItem(PORTAL_TOKEN_KEY);
}

/** The portal's "Sign out": retires this client's portal tokens on the server (every device — the
 * portal has no per-device sessions), then forgets this one. Best effort: offline or an
 * unreachable API still signs this browser out. */
export async function signOutPortal(): Promise<void> {
  const token = getPortalToken();
  if (token) {
    try {
      await fetch(`${API_URL}/portal/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      // offline or timed out
    }
  }
  clearPortalToken();
}

/** Same shape as apiFetch — kept separate so a client-portal session never shares a token slot with an internal user session. */
export async function portalApiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getPortalToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await sendApiRequest(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) throw await readApiError(res);

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/pdf") ||
    contentType.includes("application/octet-stream") ||
    contentType.startsWith("image/")
  ) {
    return (await res.blob()) as unknown as T;
  }
  return res.json() as Promise<T>;
}
