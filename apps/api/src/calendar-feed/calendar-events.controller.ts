import { Controller, Get, Query } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CalendarFeedService } from "./calendar-feed.service";

/** Authenticated JSON counterpart to CalendarFeedController's public ICS feed — powers the in-app calendar page. */
@Controller("calendar/events")
export class CalendarEventsController {
  constructor(private readonly service: CalendarFeedService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("monthsAhead") monthsAhead?: string) {
    return this.service.listEvents(user.companyId, monthsAhead ? Number(monthsAhead) : undefined);
  }
}
