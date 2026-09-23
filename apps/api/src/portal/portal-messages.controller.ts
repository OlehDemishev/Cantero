import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createPortalMessageSchema, type AuthUser, type CreatePortalMessageInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PortalMessagesService } from "./portal-messages.service";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { RequiresFor } from "../common/decorators/permissions.decorator";

/** The internal-staff side of the client project message thread — see PortalMessagesService. */
@RequiresFor("clients.view", "clients.manage")
@Controller("projects/:id/portal-messages")
export class PortalMessagesController {
  constructor(private readonly service: PortalMessagesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param("id") projectId: string) {
    return this.service.listForStaff(user.companyId, projectId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param("id") projectId: string,
    @Body(new ZodValidationPipe(createPortalMessageSchema)) body: CreatePortalMessageInput,
  ) {
    return this.service.createForStaff(user.companyId, { userId: user.userId, name: user.name }, projectId, body.content);
  }
}
