import { Controller, Get, Query } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JobCostingService } from "./job-costing.service";

@Controller("job-costing")
export class JobCostingController {
  constructor(private readonly service: JobCostingService) {}

  @Get()
  report(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.report(user.companyId, projectId);
  }
}
