import { z } from "zod";

/** Minimal SCIM 2.0 (RFC 7644) User shapes — enough for a real IdP (Okta, Azure AD) to provision
 * and deactivate accounts once someone wires one up. No IdP is actually connected yet; this is
 * the endpoint shape and auth wiring (via a company API key), not a live integration. */
export const scimCreateUserSchema = z.object({
  userName: z.string().email(),
  name: z.object({ givenName: z.string().optional(), familyName: z.string().optional() }).optional(),
  emails: z.array(z.object({ value: z.string().email(), primary: z.boolean().optional() })).optional(),
  active: z.boolean().optional(),
});
export type ScimCreateUserInput = z.infer<typeof scimCreateUserSchema>;

export const scimPatchUserSchema = z.object({
  Operations: z.array(
    z.object({
      op: z.enum(["replace", "add", "remove"]),
      path: z.string().optional(),
      value: z.unknown().optional(),
    }),
  ),
});
export type ScimPatchUserInput = z.infer<typeof scimPatchUserSchema>;
