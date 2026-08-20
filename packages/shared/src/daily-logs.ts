import { z } from "zod";

export const WEATHER_CONDITIONS = ["clear", "cloudy", "rain", "snow", "extreme_heat", "extreme_cold", "other"] as const;
export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];

export const createDailyLogSchema = z.object({
  projectId: z.string().uuid(),
  date: z.string().datetime(),
  weatherCondition: z.enum(WEATHER_CONDITIONS).optional(),
  weatherNotes: z.string().max(500).optional(),
  crewCount: z.number().int().min(0).max(9999).optional(),
  crewNotes: z.string().max(1000).optional(),
  workPerformed: z.string().min(1).max(4000),
  delays: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateDailyLogInput = z.infer<typeof createDailyLogSchema>;

export const updateDailyLogSchema = createDailyLogSchema.omit({ projectId: true, date: true }).partial();
export type UpdateDailyLogInput = z.infer<typeof updateDailyLogSchema>;
