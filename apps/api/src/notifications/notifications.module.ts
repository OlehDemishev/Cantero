import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { PushController } from "./push.controller";
import { PushService } from "./push.service";
import { PushCheckProcessor } from "./push-check.processor";

@Module({
  controllers: [NotificationsController, PushController],
  providers: [NotificationsService, PushService, PushCheckProcessor],
})
export class NotificationsModule {}
