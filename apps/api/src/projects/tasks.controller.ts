import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createTaskCommitmentSchema,
  createTaskDependencySchema,
  createTaskSchema,
  resolveTaskCommitmentSchema,
  shiftProjectScheduleSchema,
  updateTaskSchema,
  type AuthUser,
  type CreateTaskCommitmentInput,
  type CreateTaskDependencyInput,
  type CreateTaskInput,
  type ResolveTaskCommitmentInput,
  type ShiftProjectScheduleInput,
  type UpdateTaskInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { TasksService } from "./tasks.service";

@Controller("tasks")
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Get("critical-path")
  criticalPath(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.getCriticalPath(user.companyId, projectId);
  }

  @Get("look-ahead")
  lookAhead(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string, @Query("weeks") weeks?: string) {
    return this.service.getLookAhead(user.companyId, projectId, weeks ? Number(weeks) : undefined);
  }

  @Get("portfolio-schedule")
  portfolioSchedule(@CurrentUser() user: AuthUser, @Query("projectIds") projectIds: string) {
    return this.service.portfolioSchedule(user.companyId, projectIds.split(",").filter(Boolean));
  }

  @Get("commitments")
  listCommitments(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.listCommitmentsForProject(user.companyId, projectId);
  }

  @Get("ppc-report")
  ppcReport(@CurrentUser() user: AuthUser, @Query("projectId") projectId?: string) {
    return this.service.ppcReport(user.companyId, projectId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskInput) {
    return this.service.create(user.companyId, body);
  }

  @Post("shift-schedule")
  shiftSchedule(
    @CurrentUser() user: AuthUser,
    @Query("projectId") projectId: string,
    @Body(new ZodValidationPipe(shiftProjectScheduleSchema)) body: ShiftProjectScheduleInput,
  ) {
    return this.service.shiftProjectSchedule(user.companyId, projectId, body.days);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) body: UpdateTaskInput,
  ) {
    return this.service.update(user.companyId, id, body, user.userId, user.role);
  }

  @Post(":id/dependencies")
  addDependency(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createTaskDependencySchema)) body: CreateTaskDependencyInput,
  ) {
    return this.service.addDependency(user.companyId, id, body, user.userId, user.role);
  }

  @Delete("dependencies/:dependencyId")
  removeDependency(@CurrentUser() user: AuthUser, @Param("dependencyId") dependencyId: string) {
    return this.service.removeDependency(user.companyId, dependencyId, user.userId, user.role);
  }

  @Post(":id/commitments")
  commitTask(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createTaskCommitmentSchema)) body: CreateTaskCommitmentInput,
  ) {
    return this.service.commitTask(user.companyId, user.name, id, body, user.userId, user.role);
  }

  @Post("commitments/:id/resolve")
  resolveCommitment(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(resolveTaskCommitmentSchema)) body: ResolveTaskCommitmentInput,
  ) {
    return this.service.resolveCommitment(user.companyId, id, body, user.userId, user.role);
  }
}
