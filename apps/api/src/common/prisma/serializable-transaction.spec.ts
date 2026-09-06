import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { runSerializable } from "./serializable-transaction";

function writeConflict(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Transaction write conflict", { code: "P2034", clientVersion: "test" });
}

describe("runSerializable", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns the callback's result on the first attempt", async () => {
    const prisma = { $transaction: jest.fn((fn: (tx: unknown) => unknown) => Promise.resolve(fn({}))) };
    const fn = jest.fn().mockResolvedValue("ok");

    const result = await runSerializable(prisma as never, fn);

    expect(result).toBe("ok");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("retries (after a backoff delay) on a P2034 write conflict and succeeds on the next attempt", async () => {
    const conflict = writeConflict();
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValueOnce(conflict)
        .mockImplementationOnce((fn: (tx: unknown) => unknown) => Promise.resolve(fn({}))),
    };
    const fn = jest.fn().mockResolvedValue("ok");

    const promise = runSerializable(prisma as never, fn);
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("ok");
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("raises a 409 (not the raw Prisma error) after every attempt keeps conflicting", async () => {
    const conflict = writeConflict();
    const prisma = { $transaction: jest.fn().mockRejectedValue(conflict) };

    const promise = runSerializable(prisma as never, jest.fn());
    // Swallow the eventual rejection so it doesn't register as an unhandled rejection while the
    // fake-timer flush below is still in flight.
    promise.catch(() => {});
    await jest.runAllTimersAsync();

    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(8);
  });

  it("does not retry a non-conflict error thrown from inside the transaction", async () => {
    const boom = new Error("validation failed");
    const prisma = { $transaction: jest.fn().mockRejectedValue(boom) };

    await expect(runSerializable(prisma as never, jest.fn())).rejects.toBe(boom);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
