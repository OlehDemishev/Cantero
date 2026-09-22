import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import {
  convertClientChangeRequestSchema,
  declineClientChangeRequestSchema,
  type AuthUser,
  type ConvertClientChangeRequestInput,
  type DeclineClientChangeRequestInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ClientChangeRequestsService } from "./client-change-requests.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";

@ProjectResource("ClientChangeRequest")
@Controller("client-change-requests")
export class ClientChangeRequestsController {
  constructor(private readonly service: ClientChangeRequestsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Post(":id/start-review")
  startReview(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.startReview(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/convert")
  convert(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(convertClientChangeRequestSchema)) body: ConvertClientChangeRequestInput,
  ) {
    return this.service.convert(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/decline")
  decline(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(declineClientChangeRequestSchema)) body: DeclineClientChangeRequestInput,
  ) {
    return this.service.decline(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
