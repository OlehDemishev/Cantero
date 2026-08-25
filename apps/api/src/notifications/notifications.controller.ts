import { Body, Controller, Get, Post } from "@nestjs/common";
import {
  markAllNotificationsReadSchema,
  markNotificationReadSchema,
  type AuthUser,
  type MarkAllNotificationsReadInput,
  type MarkNotificationReadInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId, user.userId);
  }

  @Post("mark-seen")
  markSeen(@CurrentUser() user: AuthUser) {
    return this.service.markSeen(user.companyId, user.userId);
  }

  @Post("mark-read")
  markRead(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(markNotificationReadSchema)) body: MarkNotificationReadInput,
  ) {
    return this.service.markRead(user.companyId, user.userId, body.notificationKey);
  }

  @Post("mark-all-read")
  markAllRead(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(markAllNotificationsReadSchema)) body: MarkAllNotificationsReadInput,
  ) {
    return this.service.markAllRead(user.companyId, user.userId, body.notificationKeys);
  }
}
