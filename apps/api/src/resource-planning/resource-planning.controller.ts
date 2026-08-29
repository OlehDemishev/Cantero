import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  assignCrewSchema,
  createCrewSchema,
  createResourceAssignmentSchema,
  updateCrewMembersSchema,
  type AssignCrewInput,
  type AuthUser,
  type CreateCrewInput,
  type CreateResourceAssignmentInput,
  type UpdateCrewMembersInput,
} from "@cantero/shared";
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

  @Get("workload-heatmap")
  workloadHeatmap(@CurrentUser() user: AuthUser, @Query("from") from?: string, @Query("to") to?: string) {
    if (!from || !to) throw new BadRequestException("from and to are required");
    return this.service.workloadHeatmap(user.companyId, new Date(from), new Date(to));
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

  @Get("crews")
  listCrews(@CurrentUser() user: AuthUser) {
    return this.service.listCrews(user.companyId);
  }

  @Post("crews")
  createCrew(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createCrewSchema)) body: CreateCrewInput) {
    return this.service.createCrew(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch("crews/:id/members")
  updateCrewMembers(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCrewMembersSchema)) body: UpdateCrewMembersInput,
  ) {
    return this.service.updateCrewMembers(user.companyId, id, body);
  }

  @Delete("crews/:id")
  deleteCrew(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.deleteCrew(user.companyId, id);
  }

  @Post("crews/assign")
  assignCrew(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(assignCrewSchema)) body: AssignCrewInput) {
    return this.service.assignCrew(user.companyId, { userId: user.userId, name: user.name }, body);
  }
}
