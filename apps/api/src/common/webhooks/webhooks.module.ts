import { Global, Module } from "@nestjs/common";
import { WebhooksService } from "./webhooks.service";
import { OutboxService } from "./outbox.service";
import { OutboxProcessor } from "./outbox.processor";

@Global()
@Module({
  providers: [WebhooksService, OutboxService, OutboxProcessor],
  exports: [WebhooksService, OutboxService],
})
export class WebhooksModule {}
