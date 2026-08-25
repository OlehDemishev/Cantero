import { Module } from "@nestjs/common";
import { CalendarFeedController } from "./calendar-feed.controller";
import { CalendarFeedService } from "./calendar-feed.service";

@Module({
  controllers: [CalendarFeedController],
  providers: [CalendarFeedService],
})
export class CalendarFeedModule {}
