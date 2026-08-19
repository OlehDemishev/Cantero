import { Controller, Get, Post } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
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
}
