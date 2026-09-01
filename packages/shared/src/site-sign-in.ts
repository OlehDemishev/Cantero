import { z } from "zod";

export const createSiteSignInSchema = z.object({
  name: z.string().min(1).max(160),
  visitorCompany: z.string().max(160).optional(),
  purpose: z.string().max(300).optional(),
});
export type CreateSiteSignInInput = z.infer<typeof createSiteSignInSchema>;
