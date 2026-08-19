import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createProjectSchema, type AuthUser, type CreateProjectInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ProjectsService } from "./projects.service";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectInput,
  ) {
    return this.service.create(user.companyId, body);
  }
}
