import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createProjectSchema,
  updateProjectWarrantySchema,
  type AuthUser,
  type CreateProjectInput,
  type UpdateProjectWarrantyInput,
} from "@cantero/shared";
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

  @Get(":id/weather-forecast")
  weatherForecast(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.weatherForecast(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Patch(":id/warranty")
  updateWarranty(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProjectWarrantySchema)) body: UpdateProjectWarrantyInput,
  ) {
    return this.service.updateWarranty(user.companyId, id, body);
  }
}
