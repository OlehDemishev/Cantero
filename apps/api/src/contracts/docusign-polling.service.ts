import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { PrismaService } from "../common/prisma/prisma.service";
import { DOCUSIGN_POLL_QUEUE } from "../common/queue/queue.module";
import { ContractsService } from "./contracts.service";

const POLL_INTERVAL_MS = 15 * 60 * 1000;
/** Delay between consecutive DocuSign API calls within one sweep — DocuSign's published
 * eSignature API limits are per-second burst limits (not just an hourly quota), so firing every
 * pending envelope's status check back-to-back risks tripping them under load; a small fixed gap
 * keeps this well under that regardless of how many contracts are awaiting signature at once. */
const BETWEEN_CALLS_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Replaces the old "Refresh signing status" button: no DocuSign Connect webhook is configured
 * (see DocusignService's doc comment — that needs a live account's admin console), so this sweeps
 * every contract still awaiting a DocuSign signature on a fixed interval instead, calling the same
 * ContractsService.refreshDocusignStatus() the button used to trigger manually. Runs sequentially
 * with a small delay between calls rather than in parallel, to respect DocuSign's rate limits.
 */
@Injectable()
export class DocusignPollingService implements OnModuleInit {
  private readonly logger = new Logger(DocusignPollingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contracts: ContractsService,
    @InjectQueue(DOCUSIGN_POLL_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    await this.queue.add("run-due", {}, { repeat: { every: POLL_INTERVAL_MS }, jobId: "docusign-poll-repeat" });
  }

  async runDuePass(): Promise<{ checked: number; signed: number; voided: number }> {
    const pending = await this.prisma.contract.findMany({
      where: { status: "sent", docusignEnvelopeId: { not: null } },
      select: { id: true, companyId: true },
    });

    let signed = 0;
    let voided = 0;
    for (let i = 0; i < pending.length; i++) {
      const contract = pending[i];
      try {
        const updated = await this.contracts.refreshDocusignStatus(contract.companyId, contract.id);
        if (updated.status === "signed") signed++;
        else if (updated.status === "void") voided++;
      } catch (err) {
        this.logger.warn(`Failed to poll DocuSign status for contract ${contract.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (i < pending.length - 1) await sleep(BETWEEN_CALLS_DELAY_MS);
    }
    return { checked: pending.length, signed, voided };
  }
}
