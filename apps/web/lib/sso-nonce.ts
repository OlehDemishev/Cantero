"use client";

/** sessionStorage, not localStorage: the nonce must belong to the one tab that started the
 * sign-in, so a callback link opened anywhere else (another browser, someone else's device) finds
 * nothing to match and can't complete a sign-in the person never started. */
const SSO_NONCE_KEY = "cantero_sso_nonce";

/** Starts an SSO sign-in in this tab: a fresh random nonce, kept until the callback consumes it. */
export function beginSsoNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  sessionStorage.setItem(SSO_NONCE_KEY, nonce);
  return nonce;
}

/** The nonce this tab started with, removed as it's read — a nonce serves one sign-in only. */
export function takeSsoNonce(): string | null {
  try {
    const nonce = sessionStorage.getItem(SSO_NONCE_KEY);
    sessionStorage.removeItem(SSO_NONCE_KEY);
    return nonce;
  } catch {
    return null;
  }
}
