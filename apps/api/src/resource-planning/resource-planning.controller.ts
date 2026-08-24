import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { createResourceAssignmentSchema, type AuthUser, type CreateResourceAssignmentInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ResourcePlanningService } from "./resource-planning.service";

@Controller("resource-planning")
export class ResourcePlanningController {
  constructor(private readonly service: ResourcePlanningService) {}

  @Get("calendar")
  calendar(@CurrentUser() user: AuthUser) {
    return this.service.calendar(user.companyId);
  }

  @Post("assignments")
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createResourceAssignmentSchema)) body: CreateResourceAssignmentInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Delete("assignments/:id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, id);
  }
}
