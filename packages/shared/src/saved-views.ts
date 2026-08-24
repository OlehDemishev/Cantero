import { z } from "zod";

export const createSavedViewSchema = z.object({
  viewType: z.string().min(1).max(60),
  name: z.string().min(1).max(80),
  filters: z.record(z.string(), z.unknown()),
});
export type CreateSavedViewInput = z.infer<typeof createSavedViewSchema>;
