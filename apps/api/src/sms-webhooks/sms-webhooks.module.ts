import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module";
import { SmsWebhooksController } from "./sms-webhooks.controller";
import { SmsWebhooksService } from "./sms-webhooks.service";

@Module({
  imports: [ProjectsModule],
  controllers: [SmsWebhooksController],
  providers: [SmsWebhooksService],
})
export class SmsWebhooksModule {}
