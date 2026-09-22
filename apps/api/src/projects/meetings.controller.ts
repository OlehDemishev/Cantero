import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, StreamableFile } from "@nestjs/common";
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
import { ProjectResource } from "../common/project-access/project-resource.decorator";

@ProjectResource("Meeting")
@ProjectResource("MeetingActionItem", "itemId")
@Controller("meetings")
export class MeetingsController {
  constructor(private readonly service: MeetingsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Get("open-action-items")
  openActionItems(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.openActionItems(user.companyId, projectId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Get(":id/pdf")
  @Header("Content-Type", "application/pdf")
  async pdf(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const buffer = await this.service.generatePdf(user.companyId, id);
    return new StreamableFile(buffer, { disposition: `attachment; filename="meeting-minutes.pdf"` });
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
