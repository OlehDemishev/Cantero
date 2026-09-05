import { Prisma } from "@prisma/client";

const MAX_ATTEMPTS = 5;

/** `INV-####` numbers are derived from a live row count rather than a DB sequence, so two
 * invoices created for the same company at nearly the same moment can compute the same number.
 * The `@@unique([companyId, number])` constraint on Invoice turns that into a P2002 error instead
 * of a silent duplicate — this catches exactly that error and retries with a freshly recomputed
 * number, so a concurrent create fails only if it keeps colliding MAX_ATTEMPTS times in a row. */
export async function createInvoiceWithNumber<T>(
  prisma: { invoice: { count: (args: { where: { companyId: string } }) => Promise<number> } },
  companyId: string,
  create: (number: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const count = await prisma.invoice.count({ where: { companyId } });
    const number = `INV-${String(count + 1).padStart(4, "0")}`;
    try {
      return await create(number);
    } catch (err) {
      const isNumberClash =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        (err.meta?.target as string[] | undefined)?.includes("number");
      if (!isNumberClash || attempt === MAX_ATTEMPTS) throw err;
    }
  }
  /* istanbul ignore next -- unreachable: the loop always returns or throws */
  throw new Error("Failed to generate a unique invoice number");
}
