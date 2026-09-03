import { z } from "zod";

export const createMarketingCampaignSchema = z.object({
  name: z.string().min(1).max(160),
  channel: z.string().min(1).max(80),
  spend: z.number().nonnegative().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateMarketingCampaignInput = z.infer<typeof createMarketingCampaignSchema>;

export const updateMarketingCampaignSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  channel: z.string().min(1).max(80).optional(),
  spend: z.number().nonnegative().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdateMarketingCampaignInput = z.infer<typeof updateMarketingCampaignSchema>;
