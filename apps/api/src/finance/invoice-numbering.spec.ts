import { Prisma } from "@prisma/client";
import { createInvoiceWithNumber } from "./invoice-numbering";

function numberClash(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["companyId", "number"] },
  });
}

describe("createInvoiceWithNumber", () => {
  it("uses the count-derived number on the first attempt when there's no clash", async () => {
    const prisma = { invoice: { count: jest.fn().mockResolvedValue(3) } };
    const create = jest.fn().mockResolvedValue({ id: "inv-1" });

    const result = await createInvoiceWithNumber(prisma, "co-1", create);

    expect(create).toHaveBeenCalledWith("INV-0004");
    expect(result).toEqual({ id: "inv-1" });
    expect(prisma.invoice.count).toHaveBeenCalledTimes(1);
  });

  it("retries with a freshly recomputed number after a unique-number clash", async () => {
    const prisma = { invoice: { count: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(4) } };
    const create = jest.fn().mockRejectedValueOnce(numberClash()).mockResolvedValueOnce({ id: "inv-2" });

    const result = await createInvoiceWithNumber(prisma, "co-1", create);

    expect(create).toHaveBeenNthCalledWith(1, "INV-0004");
    expect(create).toHaveBeenNthCalledWith(2, "INV-0005");
    expect(result).toEqual({ id: "inv-2" });
  });

  it("gives up after 5 consecutive clashes", async () => {
    const prisma = { invoice: { count: jest.fn().mockResolvedValue(3) } };
    const clash = numberClash();
    const create = jest.fn().mockRejectedValue(clash);

    await expect(createInvoiceWithNumber(prisma, "co-1", create)).rejects.toBe(clash);
    expect(create).toHaveBeenCalledTimes(5);
  });

  it("does not retry on an unrelated error", async () => {
    const prisma = { invoice: { count: jest.fn().mockResolvedValue(3) } };
    const otherError = new Error("boom");
    const create = jest.fn().mockRejectedValue(otherError);

    await expect(createInvoiceWithNumber(prisma, "co-1", create)).rejects.toBe(otherError);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
