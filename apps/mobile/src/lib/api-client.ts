import * as SecureStore from "expo-secure-store";
import { clearOfflineData } from "./offline-db";

/** Inlined at build time by Expo. On a physical device `localhost` is the phone itself, so this
 * has to be the dev machine's LAN address — see .env.example. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api";

const TOKEN_KEY = "cantero_token";
/** Fingerprint of whose data is sitting in the offline database — deliberately NOT cleared on
 * logout, only compared and overwritten on the next setToken(). That's what lets the same worker
 * log out and back in without losing their own unsynced work, while still catching a genuine
 * account switch on a phone shared between shifts. */
const ACCOUNT_KEY = "cantero_account";

/** SecureStore is async (Keychain/Keystore), but apiFetch needs the token synchronously on every
 * request. The value is mirrored here after restore/sign-in so requests never await the keychain. */
let cachedToken: string | null = null;

export async function restoreToken(): Promise<string | null> {
  cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return cachedToken;
}

export function getToken(): string | null {
  return cachedToken;
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Hermes doesn't expose `atob` in a typed, guaranteed way, so decode base64url here instead.
 * Like `atob`, this yields one character per byte: a multi-byte name in the payload comes out
 * garbled, which is fine because the only claim read below is an ASCII id. */
function decodeBase64Url(input: string): string {
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const char of input.replace(/-/g, "+").replace(/_/g, "/")) {
    const value = BASE64_ALPHABET.indexOf(char);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

/** Reads the `userId` claim out of the JWT payload without verifying the signature — fine here,
 * since it only ever feeds a client-side "is this the same person as before" check, never an
 * authorization decision (the server verifies the token on every request). */
function decodeUserId(token: string): string | null {
  try {
    const payload = JSON.parse(decodeBase64Url(token.split(".")[1]));
    return typeof payload?.userId === "string" ? payload.userId : null;
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  const previousUserId = await SecureStore.getItemAsync(ACCOUNT_KEY);
  const newUserId = decodeUserId(token);
  if (newUserId && previousUserId && previousUserId !== newUserId) {
    await clearOfflineData();
  }
  if (newUserId) await SecureStore.setItemAsync(ACCOUNT_KEY, newUserId);
  cachedToken = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  cachedToken = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
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

/** The request never produced a response (offline, DNS failure, connection refused, timeout).
 * The web client can test `instanceof TypeError` for this, but Expo SDK 57 replaces the global
 * fetch with expo/fetch, which rejects with its own FetchError instead — so the distinction is
 * made here, where it's unambiguous, rather than by guessing the implementation's error class. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "NetworkError";
    this.cause = cause;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch (err) {
    throw new NetworkError(err);
  }

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
