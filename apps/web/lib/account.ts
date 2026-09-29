"use client";

/** Where the signed-in session's token lives. */
export const TOKEN_KEY = "cantero_token";

export interface Account {
  userId: string;
  companyId: string;
  /** "<userId>:<companyId>" — whose offline data a store holds. */
  key: string;
}

/**
 * Whose session a token belongs to, read from its claims without verifying the signature — fine
 * here, since this only decides which of this device's offline stores to use, never what the server
 * allows (it verifies the token on every request).
 */
export function accountOf(token: string | null): Account | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload?.userId !== "string" || typeof payload?.companyId !== "string") return null;
    return { userId: payload.userId, companyId: payload.companyId, key: `${payload.userId}:${payload.companyId}` };
  } catch {
    return null;
  }
}

export function currentAccount(): Account | null {
  if (typeof window === "undefined") return null;
  return accountOf(localStorage.getItem(TOKEN_KEY));
}
