import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { PushController } from "./push.controller";
import { PushService } from "./push.service";
import { PushCheckProcessor } from "./push-check.processor";
import { NotificationDigestService } from "./notification-digest.service";
import { NotificationDigestProcessor } from "./notification-digest.processor";
import { WeatherModule } from "../weather/weather.module";
import { FinanceModule } from "../finance/finance.module";

@Module({
  imports: [WeatherModule, FinanceModule],
  controllers: [NotificationsController, PushController],
  providers: [NotificationsService, PushService, PushCheckProcessor, NotificationDigestService, NotificationDigestProcessor],
})
export class NotificationsModule {}
