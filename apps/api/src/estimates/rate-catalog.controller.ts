import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createRateCatalogItemSchema, type AuthUser, type CreateRateCatalogItemInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { RateCatalogService } from "./rate-catalog.service";

@Controller("estimates/rate-catalog")
export class RateCatalogController {
  constructor(private readonly service: RateCatalogService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  // Declared before ":id" so "starter" isn't swallowed as an item id.
  @Roles("owner", "admin")
  @Post("starter")
  seedStarter(@CurrentUser() user: AuthUser) {
    return this.service.seedStarter(user.companyId, { userId: user.userId, name: user.name });
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createRateCatalogItemSchema)) body: CreateRateCatalogItemInput,
  ) {
    return this.service.create(user.companyId, body);
  }
}
