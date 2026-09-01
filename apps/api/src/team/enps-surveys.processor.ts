import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { ENPS_SURVEYS_QUEUE } from "../common/queue/queue.module";
import { EnpsSurveysService } from "./enps-surveys.service";

/** Fires daily on the schedule EnpsSurveysService.onModuleInit sets up — most days it's a no-op since each company's own wave is only due every ~90 days. */
@Processor(ENPS_SURVEYS_QUEUE)
export class EnpsSurveysProcessor extends WorkerHost {
  private readonly logger = new Logger(EnpsSurveysProcessor.name);

  constructor(private readonly enpsSurveys: EnpsSurveysService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const { companiesSent } = await this.enpsSurveys.runDuePass();
    if (companiesSent > 0) this.logger.log(`Sent an eNPS wave for ${companiesSent} compan(y/ies)`);
  }
}
