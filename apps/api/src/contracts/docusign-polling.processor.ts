import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { DOCUSIGN_POLL_QUEUE } from "../common/queue/queue.module";
import { DocusignPollingService } from "./docusign-polling.service";

@Processor(DOCUSIGN_POLL_QUEUE)
export class DocusignPollingProcessor extends WorkerHost {
  private readonly logger = new Logger(DocusignPollingProcessor.name);

  constructor(private readonly polling: DocusignPollingService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const { checked, signed, voided } = await this.polling.runDuePass();
    if (checked > 0) this.logger.log(`Polled DocuSign status for ${checked} pending envelope(s): ${signed} signed, ${voided} voided`);
  }
}
