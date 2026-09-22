import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { SEMANTIC_INDEX_QUEUE } from "../../common/queue/queue.module";
import { SemanticSearchService } from "./semantic-search.service";

/** Every few minutes (SemanticSearchService.onModuleInit): embed what changed, drop what was deleted. */
@Processor(SEMANTIC_INDEX_QUEUE)
export class SemanticIndexProcessor extends WorkerHost {
  private readonly logger = new Logger(SemanticIndexProcessor.name);

  constructor(private readonly service: SemanticSearchService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    try {
      await this.service.indexPending();
    } catch (err) {
      // Most likely the model couldn't be loaded (no download allowed and none cached) — the next
      // run tries again; search answers with what's already indexed meanwhile.
      this.logger.warn(`Semantic indexing failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
