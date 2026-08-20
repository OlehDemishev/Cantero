import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { PUSH_CHECK_QUEUE } from "../common/queue/queue.module";
import { PushService } from "./push.service";

/** Fires on the repeatable schedule set up by PushService.onModuleInit — one pass over every membership with an active push subscription. */
@Processor(PUSH_CHECK_QUEUE)
export class PushCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(PushCheckProcessor.name);

  constructor(private readonly pushService: PushService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    await this.pushService.checkAndNotifyAll();
    this.logger.debug("Push check pass complete");
  }
}
