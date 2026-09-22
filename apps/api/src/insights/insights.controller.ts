import { Controller, Get, Param } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { InsightsService } from "./insights.service";

@Controller("insights")
export class InsightsController {
  constructor(private readonly service: InsightsService) {}

  @Get("triage")
  triage(@CurrentUser() user: AuthUser) {
    return this.service.triage(user.companyId, undefined, user);
  }

  @Get("projects/:id/health")
  projectHealth(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.projectHealth(user.companyId, id);
  }
}
