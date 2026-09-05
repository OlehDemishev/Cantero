import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  addMeetingActionItemSchema,
  createMeetingSchema,
  resolveMeetingActionItemSchema,
  type AddMeetingActionItemInput,
  type AuthUser,
  type CreateMeetingInput,
  type ResolveMeetingActionItemInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { MeetingsService } from "./meetings.service";

@Controller("meetings")
export class MeetingsController {
  constructor(private readonly service: MeetingsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Get("open-action-items")
  openActionItems(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.openActionItems(user.companyId, projectId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createMeetingSchema)) body: CreateMeetingInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Post(":id/action-items")
  addActionItem(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addMeetingActionItemSchema)) body: AddMeetingActionItemInput,
  ) {
    return this.service.addActionItem(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post("action-items/:itemId/resolve")
  resolveActionItem(
    @CurrentUser() user: AuthUser,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(resolveMeetingActionItemSchema)) body: ResolveMeetingActionItemInput,
  ) {
    return this.service.resolveActionItem(user.companyId, { userId: user.userId, name: user.name }, itemId, body);
  }
}
