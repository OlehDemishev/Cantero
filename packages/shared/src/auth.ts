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
  /// Another company's referralCode, if this signup came from a shared referral link — see the
  /// platform referral program in CompanyController/AuthService.
  referralCode: z.string().max(40).optional(),
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
  /** Extra permission tiers granted via a company-defined CustomRole, additive on top of `role` — see CustomRole in schema.prisma. Absent or empty means no custom role assigned. */
  additionalRoles?: string[];
  /** UserSession row id embedded as the JWT's session claim — lets a revoked session's tokens be rejected without changing the stateless-JWT scheme everywhere else. */
  sid: string;
}

export type LoginResult = { accessToken: string; companyId: string } | { requires2fa: true; challengeToken: string };

export const verify2faSchema = z.object({
  challengeToken: z.string().min(10),
  code: z.string().min(6).max(10),
});
export type Verify2faInput = z.infer<typeof verify2faSchema>;

export const setup2faSchema = z.object({
  /** Required only when 2FA is already active on the account — see TwoFactorService.setup. */
  password: z.string().min(1).optional(),
});
export type Setup2faInput = z.infer<typeof setup2faSchema>;

export const enable2faSchema = z.object({
  code: z.string().length(6),
});
export type Enable2faInput = z.infer<typeof enable2faSchema>;

export const disable2faSchema = z.object({
  password: z.string().min(1),
});
export type Disable2faInput = z.infer<typeof disable2faSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
