import { Body, Controller, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  verify2faSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type ResetPasswordInput,
  type SignupInput,
  type Verify2faInput,
} from "@cantero/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { SessionMeta } from "../common/sessions/sessions.service";
import { AuthService } from "./auth.service";
import { TwoFactorService } from "./two-factor.service";
import { PasswordResetService } from "./password-reset.service";

function sessionMeta(req: Request): SessionMeta {
  return { userAgent: req.headers["user-agent"], ipAddress: req.ip };
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactorService: TwoFactorService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Public()
  @Post("signup")
  signup(@Body(new ZodValidationPipe(signupSchema)) body: SignupInput, @Req() req: Request) {
    return this.authService.signup(body, sessionMeta(req));
  }

  @Public()
  @Post("login")
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput, @Req() req: Request) {
    return this.authService.login(body, sessionMeta(req));
  }

  @Public()
  @Post("2fa/verify")
  verify2fa(@Body(new ZodValidationPipe(verify2faSchema)) body: Verify2faInput, @Req() req: Request) {
    return this.twoFactorService.verifyChallenge(body.challengeToken, body.code, sessionMeta(req));
  }

  @Public()
  @Post("forgot-password")
  forgotPassword(@Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput) {
    return this.passwordResetService.forgotPassword(body);
  }

  @Public()
  @Post("reset-password")
  resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput) {
    return this.passwordResetService.resetPassword(body);
  }
}
