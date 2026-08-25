import { Controller, Get, Header, Param } from "@nestjs/common";
import { Public } from "../common/decorators/public.decorator";
import { CalendarFeedService } from "./calendar-feed.service";

@Public()
@Controller("public/calendar")
export class CalendarFeedController {
  constructor(private readonly service: CalendarFeedService) {}

  @Get(":token")
  @Header("Content-Type", "text/calendar; charset=utf-8")
  async feed(@Param("token") token: string): Promise<string> {
    return this.service.buildFeed(token.replace(/\.ics$/, ""));
  }
}
