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

export const startSsoLoginSchema = z.object({
  email: z.string().email(),
});
export type StartSsoLoginInput = z.infer<typeof startSsoLoginSchema>;
