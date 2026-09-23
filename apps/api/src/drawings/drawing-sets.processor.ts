import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { DRAWING_SETS_QUEUE } from "../common/queue/queue.module";
import { DrawingSetsService, type DrawingSetJob } from "./drawing-sets.service";

/**
 * Reads uploaded drawing sets, splits reviewed ones into sheets, and backfills old sheets' links.
 * One job at a time: each one keeps a worker thread busy with pdf.js and Tesseract, and a second in
 * parallel would only slow both on a small server.
 */
@Processor(DRAWING_SETS_QUEUE, { concurrency: 1 })
export class DrawingSetsProcessor extends WorkerHost {
  private readonly logger = new Logger(DrawingSetsProcessor.name);

  constructor(private readonly service: DrawingSetsService) {
    super();
  }

  async process(job: Job<DrawingSetJob>): Promise<void> {
    const data = job.data;
    if (data.kind === "import") return this.service.runImport(data.setId);
    if (data.kind === "backfill-links") {
      await this.service.backfillLinks();
      return;
    }
    try {
      await this.service.runAnalysis(data.setId);
    } catch (err) {
      // Out of retries: say so on the set rather than leave it "analyzing" forever.
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        this.logger.warn(`Reading drawing set ${data.setId} failed: ${err instanceof Error ? err.message : String(err)}`);
        await this.service.markFailed(data.setId, "failed");
        return;
      }
      throw err;
    }
  }
}
