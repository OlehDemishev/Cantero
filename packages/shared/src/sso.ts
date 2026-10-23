import { z } from "zod";

/// Sets all four SSO fields together — no partial updates. To disable SSO, call the dedicated
/// DELETE endpoint instead of PATCHing a null body (Express's strict JSON parser rejects a bare
/// `null` top-level body before it ever reaches validation).
export const updateSsoConfigSchema = z.object({
  domain: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i, "Enter a domain, e.g. acme.com"),
  entryPoint: z.string().url(),
  issuer: z.string().min(1).max(500),
  cert: z.string().min(50, "Paste the IdP's full X.509 certificate"),
});
export type UpdateSsoConfigInput = z.infer<typeof updateSsoConfigSchema>;

/// A random value the login page keeps in sessionStorage for the length of one SSO sign-in. It
/// travels to the IdP and back as SAML RelayState, the ACS binds the one-time code to it, and the
/// code is only exchanged together with it — so the sign-in completes only in the browser tab
/// that started it (no login CSRF via someone else's callback link).
export const ssoNonceSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, "Invalid SSO nonce");

export const startSsoLoginSchema = z.object({
  email: z.string().email(),
  nonce: ssoNonceSchema,
});
export type StartSsoLoginInput = z.infer<typeof startSsoLoginSchema>;

/// The browser's half of the SSO hand-off: the one-time code from /sso/callback plus its nonce.
export const exchangeSsoCodeSchema = z.object({
  code: z.string().min(1).max(200),
  nonce: ssoNonceSchema,
});
export type ExchangeSsoCodeInput = z.infer<typeof exchangeSsoCodeSchema>;
