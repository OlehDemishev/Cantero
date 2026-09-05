import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { updateDeficiencySchema, type AuthUser, type UpdateDeficiencyInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { DeficienciesService } from "./deficiencies.service";

@Controller("deficiencies")
export class DeficienciesController {
  constructor(private readonly service: DeficienciesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Get("heat-map")
  heatMap(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.heatMap(user.companyId, projectId);
  }

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
