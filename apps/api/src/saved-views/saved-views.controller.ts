import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { createSavedViewSchema, type AuthUser, type CreateSavedViewInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SavedViewsService } from "./saved-views.service";

@Controller("saved-views")
export class SavedViewsController {
  constructor(private readonly service: SavedViewsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("viewType") viewType: string) {
    return this.service.list(user.companyId, user.userId, viewType);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSavedViewSchema)) body: CreateSavedViewInput,
  ) {
    return this.service.create(user.companyId, user.userId, body);
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, user.userId, id);
  }
}
