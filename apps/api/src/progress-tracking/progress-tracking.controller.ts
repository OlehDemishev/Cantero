import { Controller, Get, Param, Post } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ProgressTrackingService } from "./progress-tracking.service";

@Controller("projects/:id/progress-estimates")
export class ProgressTrackingController {
  constructor(private readonly service: ProgressTrackingService) {}

  @Get()
  history(@CurrentUser() user: AuthUser, @Param("id") projectId: string) {
    return this.service.history(user.companyId, projectId);
  }

  @Post()
  compute(@CurrentUser() user: AuthUser, @Param("id") projectId: string) {
    return this.service.computeAndSnapshot(user.companyId, { userId: user.userId, name: user.name }, projectId);
  }
}
