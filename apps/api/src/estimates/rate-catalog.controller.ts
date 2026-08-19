import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createRateCatalogItemSchema, type AuthUser, type CreateRateCatalogItemInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { RateCatalogService } from "./rate-catalog.service";

@Controller("estimates/rate-catalog")
export class RateCatalogController {
  constructor(private readonly service: RateCatalogService) {}

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
    @Body(new ZodValidationPipe(createRateCatalogItemSchema)) body: CreateRateCatalogItemInput,
  ) {
    return this.service.create(user.companyId, body);
  }
}
