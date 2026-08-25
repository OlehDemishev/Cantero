import { z } from "zod";

export const submitPublicLeadSchema = z.object({
  name: z.string().min(1).max(160),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  message: z.string().max(2000).optional(),
  /// Hidden form field real visitors never fill in — non-empty means a bot, and the submission is silently dropped rather than rejected (so the bot doesn't learn the trick).
  honeypot: z.string().optional(),
});
export type SubmitPublicLeadInput = z.infer<typeof submitPublicLeadSchema>;
