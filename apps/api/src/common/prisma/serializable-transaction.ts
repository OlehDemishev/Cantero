import { Prisma, PrismaClient } from "@prisma/client";

const MAX_ATTEMPTS = 5;

/** Runs `fn` inside a Postgres SERIALIZABLE transaction and retries it on a write-conflict abort
 * (Prisma error P2034) — the standard pattern for a "read some rows, check a derived limit or
 * running total, then write" sequence that plain READ COMMITTED can't make atomic on its own
 * (two concurrent callers could otherwise both read the same snapshot, both pass the check, and
 * together violate the limit). Non-conflict errors (a thrown NotFoundException/BadRequestException
 * from validation inside `fn`, for instance) propagate immediately without retrying. */
export async function runSerializable<T>(
  prisma: Pick<PrismaClient, "$transaction">,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (err) {
      const isWriteConflict = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
      if (!isWriteConflict || attempt === MAX_ATTEMPTS) throw err;
    }
  }
  /* istanbul ignore next -- unreachable: the loop always returns or throws */
  throw new Error("Transaction failed after repeated write conflicts");
}
