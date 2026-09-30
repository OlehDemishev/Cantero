import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { EMBED_QUEUE } from "../../common/queue/queue.module";
import { Embedder, type EmbedJob } from "./embedder";

/** Computes vectors for the API process, which doesn't hold the embedding model (see Embedder).
 * A few at a time: each is a short request someone is waiting on. */
@Processor(EMBED_QUEUE, { concurrency: 4 })
export class EmbedProcessor extends WorkerHost {
  constructor(private readonly embedder: Embedder) {
    super();
  }

  process(job: Job<EmbedJob>): Promise<number[][]> {
    return this.embedder.embedHere(job.data.texts);
  }
}
