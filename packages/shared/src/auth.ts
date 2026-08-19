import { z } from "zod";
import { SUPPORTED_CURRENCIES, SUPPORTED_LOCALES, UNIT_SYSTEMS, PLAN_IDS } from "./company";

export const signupSchema = z.object({
  companyName: z.string().min(2).max(120),
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  country: z.string().length(2),
  unitSystem: z.enum(UNIT_SYSTEMS),
  currency: z.enum(SUPPORTED_CURRENCIES),
  locale: z.enum(SUPPORTED_LOCALES),
  planCode: z.enum(PLAN_IDS),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthUser {
  userId: string;
  companyId: string;
  email: string;
  name: string;
  role: string;
}
