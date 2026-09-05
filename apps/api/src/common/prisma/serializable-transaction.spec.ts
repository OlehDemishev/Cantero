import { Prisma } from "@prisma/client";
import { runSerializable } from "./serializable-transaction";

function writeConflict(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Transaction write conflict", { code: "P2034", clientVersion: "test" });
}

describe("runSerializable", () => {
  it("returns the callback's result on the first attempt", async () => {
    const prisma = { $transaction: jest.fn((fn: (tx: unknown) => unknown) => Promise.resolve(fn({}))) };
    const fn = jest.fn().mockResolvedValue("ok");

    const result = await runSerializable(prisma as never, fn);

    expect(result).toBe("ok");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("retries on a P2034 write conflict and succeeds on the next attempt", async () => {
    const conflict = writeConflict();
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValueOnce(conflict)
        .mockImplementationOnce((fn: (tx: unknown) => unknown) => Promise.resolve(fn({}))),
    };
    const fn = jest.fn().mockResolvedValue("ok");

    const result = await runSerializable(prisma as never, fn);

    expect(result).toBe("ok");
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("gives up after 5 consecutive write conflicts", async () => {
    const conflict = writeConflict();
    const prisma = { $transaction: jest.fn().mockRejectedValue(conflict) };

    await expect(runSerializable(prisma as never, jest.fn())).rejects.toBe(conflict);
    expect(prisma.$transaction).toHaveBeenCalledTimes(5);
  });

  it("does not retry a non-conflict error thrown from inside the transaction", async () => {
    const boom = new Error("validation failed");
    const prisma = { $transaction: jest.fn().mockRejectedValue(boom) };

    await expect(runSerializable(prisma as never, jest.fn())).rejects.toBe(boom);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
