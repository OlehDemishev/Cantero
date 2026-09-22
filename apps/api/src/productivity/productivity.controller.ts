import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { logProductivitySchema, type AuthUser, type LogProductivityInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ProductivityService } from "./productivity.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";

@Controller()
export class ProductivityController {
  constructor(private readonly service: ProductivityService) {}

  @Get("projects/:id/productivity-logs")
  list(@CurrentUser() user: AuthUser, @Param("id") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Post("projects/:id/productivity-logs")
  log(
    @CurrentUser() user: AuthUser,
    @Param("id") projectId: string,
    @Body(new ZodValidationPipe(logProductivitySchema)) body: LogProductivityInput,
  ) {
    return this.service.log(user.companyId, { userId: user.userId, name: user.name }, projectId, body);
  }

  @NotProjectScoped("`:id` is a company cost code; the rate is company-wide")
  @Get("cost-codes/:id/productivity-rate")
  rate(@CurrentUser() user: AuthUser, @Param("id") costCodeId: string, @Query("projectId") projectId?: string) {
    return this.service.rateByCostCode(user.companyId, costCodeId, projectId);
  }

  @Get("productivity-logs/crew-scorecard")
  crewScorecard(@CurrentUser() user: AuthUser) {
    return this.service.crewScorecard(user.companyId);
  }
}
