import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { createCommentSchema, type AuthUser, type CreateCommentInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { CommentsService } from "./comments.service";

@Controller("comments")
export class CommentsController {
  constructor(private readonly service: CommentsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("taskId") taskId?: string,
    @Query("rfiId") rfiId?: string,
    @Query("punchListItemId") punchListItemId?: string,
    @Query("projectId") projectId?: string,
  ) {
    return this.service.list(user.companyId, { taskId, rfiId, punchListItemId, projectId });
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createCommentSchema)) body: CreateCommentInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }
}
