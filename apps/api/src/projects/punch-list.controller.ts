import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createPunchListItemSchema,
  updatePunchListItemSchema,
  type AuthUser,
  type CreatePunchListItemInput,
  type UpdatePunchListItemInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PunchListService } from "./punch-list.service";

@Controller("punch-list")
export class PunchListController {
  constructor(private readonly service: PunchListService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createPunchListItemSchema)) body: CreatePunchListItemInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePunchListItemSchema)) body: UpdatePunchListItemInput,
  ) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/resolve")
  resolve(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.resolve(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/verify")
  verify(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.verify(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/reopen")
  reopen(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.reopen(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
