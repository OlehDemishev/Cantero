import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  createTimeOffRequestSchema,
  decideTimeOffRequestSchema,
  type AuthUser,
  type CreateTimeOffRequestInput,
  type DecideTimeOffRequestInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { TimeOffService } from "./time-off.service";

@Controller("time-off")
export class TimeOffController {
  constructor(private readonly service: TimeOffService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createTimeOffRequestSchema)) body: CreateTimeOffRequestInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Roles("owner", "admin", "foreman")
  @Post(":id/decision")
  decide(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(decideTimeOffRequestSchema)) body: DecideTimeOffRequestInput,
  ) {
    return this.service.decide(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
