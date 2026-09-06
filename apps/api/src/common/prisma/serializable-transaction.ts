import { ConflictException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";

const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 20;
const MAX_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with full jitter, capped at MAX_DELAY_MS. Without the jitter, every
 * transaction contending for the same row would retry at (nearly) the same instant it lost the
 * previous round — worse under heavier concurrency, not better, since they'd just keep colliding
 * with each other on the next attempt too. */
function backoffDelayMs(attempt: number): number {
  const cap = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1));
  return Math.random() * cap;
}

/** Runs `fn` inside a Postgres SERIALIZABLE transaction and retries it on a write-conflict abort
 * (Prisma error P2034) — the standard pattern for a "read some rows, check a derived limit or
 * running total, then write" sequence that plain READ COMMITTED can't make atomic on its own
 * (two concurrent callers could otherwise both read the same snapshot, both pass the check, and
 * together violate the limit). Non-conflict errors (a thrown NotFoundException/BadRequestException
 * from validation inside `fn`, for instance) propagate immediately without retrying.
 *
 * Retries are exhausted, not just theoretical: a live test firing 20 concurrent requests at the
 * same contended row surfaced a handful of raw P2034s reaching the client as an opaque 500 with
 * only 5 fixed-interval attempts. Backoff-with-jitter plus a couple more attempts drives that to
 * zero at that concurrency level; if every attempt is still exhausted (heavier concurrency than
 * that, or a genuinely stuck lock), this now raises a 409 telling the client to retry, instead of
 * a 500 implying something is actually broken. */
export async function runSerializable<T>(
  prisma: Pick<PrismaClient, "$transaction">,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (err) {
      const isWriteConflict = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
      if (!isWriteConflict) throw err;
      if (attempt === MAX_ATTEMPTS) {
        throw new ConflictException("This action conflicted with another update happening at the same time — please try again.");
      }
      await sleep(backoffDelayMs(attempt));
    }
  }
  /* istanbul ignore next -- unreachable: the loop always returns or throws */
  throw new Error("Transaction failed after repeated write conflicts");
}
