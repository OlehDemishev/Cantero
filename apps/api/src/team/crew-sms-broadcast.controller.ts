import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { sendCrewSmsBroadcastSchema, type AuthUser, type SendCrewSmsBroadcastInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { CrewSmsBroadcastService } from "./crew-sms-broadcast.service";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@Requires("site.manage")
@Controller("crew-sms-broadcasts")
export class CrewSmsBroadcastController {
  constructor(private readonly service: CrewSmsBroadcastService) {}

  @Post()
  send(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(sendCrewSmsBroadcastSchema)) body: SendCrewSmsBroadcastInput) {
    return this.service.send(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId?: string) {
    return this.service.list(user.companyId, projectId);
  }
}
