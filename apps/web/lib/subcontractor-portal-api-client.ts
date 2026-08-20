import { ApiError } from "./api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TOKEN_KEY = "cantero_subcontractor_portal_token";

export function getSubcontractorPortalToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setSubcontractorPortalToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearSubcontractorPortalToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Same shape as apiFetch/portalApiFetch — kept separate so a subcontractor-portal session never shares a token slot with any other session. */
export async function subcontractorPortalApiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getSubcontractorPortalToken();
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
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
