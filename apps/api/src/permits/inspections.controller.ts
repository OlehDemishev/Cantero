import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import {
  createInspectionSchema,
  recordInspectionResultSchema,
  type AuthUser,
  type CreateInspectionInput,
  type RecordInspectionResultInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { InspectionsService } from "./inspections.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@ProjectResource("Permit", "permitId")
@ProjectResource("Inspection")
@Requires("site.manage")
@Controller("permits/:permitId/inspections")
export class InspectionsController {
  constructor(private readonly service: InspectionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param("permitId") permitId: string) {
    return this.service.list(user.companyId, permitId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param("permitId") permitId: string,
    @Body(new ZodValidationPipe(createInspectionSchema)) body: CreateInspectionInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, permitId, body);
  }

  @Post(":id/result")
  recordResult(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(recordInspectionResultSchema)) body: RecordInspectionResultInput,
  ) {
    return this.service.recordResult(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, id);
  }
}
