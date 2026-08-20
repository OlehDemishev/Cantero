import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createTaskDependencySchema,
  createTaskSchema,
  updateTaskSchema,
  type AuthUser,
  type CreateTaskDependencyInput,
  type CreateTaskInput,
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

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskInput) {
    return this.service.create(user.companyId, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) body: UpdateTaskInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }

  @Post(":id/dependencies")
  addDependency(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createTaskDependencySchema)) body: CreateTaskDependencyInput,
  ) {
    return this.service.addDependency(user.companyId, id, body);
  }

  @Delete("dependencies/:dependencyId")
  removeDependency(@CurrentUser() user: AuthUser, @Param("dependencyId") dependencyId: string) {
    return this.service.removeDependency(user.companyId, dependencyId);
  }
}
