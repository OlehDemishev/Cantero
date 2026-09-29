import { Global, Module } from "@nestjs/common";
import { WebhooksService } from "./webhooks.service";
import { OutboxService } from "./outbox.service";
import { OutboxProcessor } from "./outbox.processor";
import { backgroundProviders } from "../queue/process-role";

@Global()
@Module({
  providers: [WebhooksService, OutboxService, ...backgroundProviders(OutboxProcessor)],
  exports: [WebhooksService, OutboxService],
})
export class WebhooksModule {}
