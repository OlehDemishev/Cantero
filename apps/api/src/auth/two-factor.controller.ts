import { Body, Controller, Delete, Post } from "@nestjs/common";
import {
  disable2faSchema,
  enable2faSchema,
  setup2faSchema,
  type AuthUser,
  type Disable2faInput,
  type Enable2faInput,
  type Setup2faInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { TwoFactorService } from "./two-factor.service";

@Controller("auth/2fa")
export class TwoFactorController {
  constructor(private readonly service: TwoFactorService) {}

  @Post("setup")
  setup(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(setup2faSchema)) body: Setup2faInput) {
    return this.service.setup(user.userId, user.email, body.password);
  }

  @Post("enable")
  enable(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(enable2faSchema)) body: Enable2faInput) {
    return this.service.enable(user.userId, body.code);
  }

  @Delete()
  disable(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(disable2faSchema)) body: Disable2faInput) {
    return this.service.disable(user.userId, body.password);
  }
}
