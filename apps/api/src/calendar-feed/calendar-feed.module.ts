import { Module } from "@nestjs/common";
import { CalendarFeedController } from "./calendar-feed.controller";
import { CalendarEventsController } from "./calendar-events.controller";
import { CalendarFeedService } from "./calendar-feed.service";

@Module({
  controllers: [CalendarFeedController, CalendarEventsController],
  providers: [CalendarFeedService],
})
export class CalendarFeedModule {}
