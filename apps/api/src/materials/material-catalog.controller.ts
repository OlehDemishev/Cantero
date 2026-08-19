import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createMaterialCatalogItemSchema, type AuthUser, type CreateMaterialCatalogItemInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { MaterialCatalogService } from "./material-catalog.service";

@Controller("materials/catalog")
export class MaterialCatalogController {
  constructor(private readonly service: MaterialCatalogService) {}

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
    @Body(new ZodValidationPipe(createMaterialCatalogItemSchema)) body: CreateMaterialCatalogItemInput,
  ) {
    return this.service.create(user.companyId, body);
  }
}
