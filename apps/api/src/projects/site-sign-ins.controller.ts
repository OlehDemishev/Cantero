import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createSiteSignInSchema, type AuthUser, type CreateSiteSignInInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SiteSignInsService } from "./site-sign-ins.service";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";

@OpenToAllRoles("site and project work every member does")
@Controller("projects/:projectId/site-sign-ins")
export class SiteSignInsController {
  constructor(private readonly service: SiteSignInsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.service.list(user.companyId, projectId);
  }

  @Post()
  signIn(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Body(new ZodValidationPipe(createSiteSignInSchema)) body: CreateSiteSignInInput,
  ) {
    return this.service.signIn(user.companyId, projectId, body);
  }

  @Post(":id/sign-out")
  signOut(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Param("id") id: string) {
    return this.service.signOut(user.companyId, projectId, id);
  }
}
