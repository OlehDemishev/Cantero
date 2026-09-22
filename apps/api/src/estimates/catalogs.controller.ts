import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { createCatalogSchema, type AuthUser, type CreateCatalogInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { CatalogsService } from "./catalogs.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";

@NotProjectScoped("company price catalogs")
@Controller("catalogs")
export class CatalogsController {
  constructor(private readonly service: CatalogsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createCatalogSchema)) body: CreateCatalogInput) {
    return this.service.create(user.companyId, body);
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, id);
  }
}
