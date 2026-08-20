import { z } from "zod";

export const requestPortalLinkSchema = z.object({
  email: z.string().email(),
});
export type RequestPortalLinkInput = z.infer<typeof requestPortalLinkSchema>;

export const verifyPortalTokenSchema = z.object({
  token: z.string().min(10),
});
export type VerifyPortalTokenInput = z.infer<typeof verifyPortalTokenSchema>;
