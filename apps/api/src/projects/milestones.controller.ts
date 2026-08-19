import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { createMilestoneSchema, type AuthUser, type CreateMilestoneInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { MilestonesService } from "./milestones.service";

@Controller("milestones")
export class MilestonesController {
  constructor(private readonly service: MilestonesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createMilestoneSchema)) body: CreateMilestoneInput,
  ) {
    return this.service.create(user.companyId, body);
  }
}
