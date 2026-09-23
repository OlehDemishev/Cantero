import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { updateDeficiencySchema, type AuthUser, type UpdateDeficiencyInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { DeficienciesService } from "./deficiencies.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@ProjectResource("Deficiency")
@Requires("site.manage")
@Controller("deficiencies")
export class DeficienciesController {
  constructor(private readonly service: DeficienciesService) {}

  @OpenToAllRoles("every member reads these to do their own site work")
  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Get("heat-map")
  heatMap(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.heatMap(user.companyId, projectId);
  }

  @OpenToAllRoles("every member reads these to do their own site work")
  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateDeficiencySchema)) body: UpdateDeficiencyInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }

  @OpenToAllRoles("site work every member does on a project")
  @Post(":id/resolve")
  resolve(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.resolve(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/verify")
  verify(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.verify(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/reopen")
  reopen(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.reopen(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
