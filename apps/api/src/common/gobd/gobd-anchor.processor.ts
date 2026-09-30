import { Processor, WorkerHost } from "@nestjs/bullmq";
import { GOBD_ANCHOR_QUEUE } from "../queue/queue.module";
import { GobdAnchorService } from "./gobd-anchor.service";

/** The daily run of GobdAnchorService.anchorAll: timestamps every ledger head not yet timestamped. */
@Processor(GOBD_ANCHOR_QUEUE)
export class GobdAnchorProcessor extends WorkerHost {
  constructor(private readonly anchors: GobdAnchorService) {
    super();
  }

  process() {
    return this.anchors.anchorAll();
  }
}
