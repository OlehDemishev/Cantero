import { Body, Controller, Post } from "@nestjs/common";
import { loginSchema, signupSchema, type LoginInput, type SignupInput } from "@cantero/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("signup")
  signup(@Body(new ZodValidationPipe(signupSchema)) body: SignupInput) {
    return this.authService.signup(body);
  }

  @Public()
  @Post("login")
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput) {
    return this.authService.login(body);
  }
}
