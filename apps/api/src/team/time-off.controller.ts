import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  createTimeOffRequestSchema,
  decideTimeOffRequestSchema,
  type AuthUser,
  type CreateTimeOffRequestInput,
  type DecideTimeOffRequestInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { TimeOffService } from "./time-off.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { CREW, SelfScopeService } from "../common/permissions/self-scope.service";
import { Requires } from "../common/decorators/permissions.decorator";

@NotProjectScoped("worker time-off requests")
@OpenToAllRoles("site and project work every member does")
@Controller("time-off")
export class TimeOffController {
  constructor(
    private readonly service: TimeOffService,
    private readonly selfScope: SelfScopeService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId, await this.selfScope.listScope(user, undefined, CREW.timeOff));
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createTimeOffRequestSchema)) body: CreateTimeOffRequestInput) {
    await this.selfScope.assertOwnWorker(user, body.workerId, CREW.timeOff);
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Requires("site.crewTime")
  @Post(":id/decision")
  decide(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(decideTimeOffRequestSchema)) body: DecideTimeOffRequestInput,
  ) {
    return this.service.decide(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
