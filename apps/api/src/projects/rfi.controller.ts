import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  answerRfiSchema,
  createRfiSchema,
  updateRfiSchema,
  type AnswerRfiInput,
  type AuthUser,
  type CreateRfiInput,
  type UpdateRfiInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { RfiService } from "./rfi.service";

@Controller("rfis")
export class RfiController {
  constructor(private readonly service: RfiService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createRfiSchema)) body: CreateRfiInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodValidationPipe(updateRfiSchema)) body: UpdateRfiInput) {
    return this.service.update(user.companyId, id, body);
  }

  @Post(":id/answer")
  answer(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(answerRfiSchema)) body: AnswerRfiInput,
  ) {
    return this.service.answer(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/close")
  close(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.close(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/reopen")
  reopen(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.reopen(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
