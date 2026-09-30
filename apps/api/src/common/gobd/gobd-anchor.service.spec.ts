import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GobdAnchorService } from "./gobd-anchor.service";
import { requestTimestamp, verifyTimestampToken } from "./timestamp";
import type { PrismaService } from "../prisma/prisma.service";

jest.mock("./timestamp", () => ({ requestTimestamp: jest.fn(), verifyTimestampToken: jest.fn() }));

const TSA = "http://timestamp.tsa.example";
const HASH_5 = "a".repeat(64);
const HASH_9 = "b".repeat(64);
const STAMPED_AT = new Date("2026-09-30T03:00:00Z");

describe("GobdAnchorService", () => {
  let prisma: {
    gobdLedgerEntry: { findFirst: jest.Mock; findMany: jest.Mock };
    gobdLedgerAnchor: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock };
  };
  let queue: { add: jest.Mock; removeRepeatable: jest.Mock };
  let tsaUrl: string | undefined;
  let service: GobdAnchorService;

  beforeEach(() => {
    jest.mocked(requestTimestamp).mockReset().mockResolvedValue({ token: Buffer.from("token"), timestampedAt: STAMPED_AT });
    jest.mocked(verifyTimestampToken).mockReset().mockResolvedValue({ valid: true, timestampedAt: STAMPED_AT });
    prisma = {
      gobdLedgerEntry: { findFirst: jest.fn(), findMany: jest.fn() },
      gobdLedgerAnchor: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn((args) => Promise.resolve({ id: "anchor-1", ...args.data })) },
    };
    queue = { add: jest.fn(), removeRepeatable: jest.fn() };
    tsaUrl = TSA;
    const config = { get: () => tsaUrl } as unknown as ConfigService;
    service = new GobdAnchorService(prisma as unknown as PrismaService, config, queue as never);
  });

  describe("anchor", () => {
    it("timestamps the 32 bytes of the ledger head's hash and stores the token", async () => {
      prisma.gobdLedgerEntry.findFirst.mockResolvedValue({ sequence: 9, hash: HASH_9 });
      prisma.gobdLedgerAnchor.findFirst.mockResolvedValue({ sequence: 5 });

      await service.anchor("company-a");

      expect(requestTimestamp).toHaveBeenCalledWith(TSA, Buffer.from(HASH_9, "hex"));
      expect(prisma.gobdLedgerAnchor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { companyId: "company-a", sequence: 9, hash: HASH_9, tsaUrl: TSA, token: Buffer.from("token"), timestampedAt: STAMPED_AT },
        }),
      );
    });

    it("does nothing when the head is already timestamped, or there's no ledger yet", async () => {
      prisma.gobdLedgerEntry.findFirst.mockResolvedValueOnce({ sequence: 9, hash: HASH_9 }).mockResolvedValueOnce(null);
      prisma.gobdLedgerAnchor.findFirst.mockResolvedValue({ sequence: 9 });

      await expect(service.anchor("company-a")).resolves.toBeNull();
      await expect(service.anchor("company-b")).resolves.toBeNull();
      expect(requestTimestamp).not.toHaveBeenCalled();
    });

    it("refuses when no timestamp authority is configured", async () => {
      tsaUrl = undefined;
      await expect(service.anchor("company-a")).rejects.toThrow(BadRequestException);
    });
  });

  describe("schedule", () => {
    it("runs daily while a timestamp authority is configured, and stops once it isn't", async () => {
      await service.onModuleInit();
      expect(queue.add).toHaveBeenCalledWith("anchor-all", {}, { repeat: { every: 86_400_000 }, jobId: "gobd-anchor-repeat" });

      tsaUrl = undefined;
      await service.onModuleInit();
      expect(queue.removeRepeatable).toHaveBeenCalledWith("anchor-all", { every: 86_400_000 }, "gobd-anchor-repeat");
      await expect(service.anchorAll()).resolves.toEqual({ anchored: 0 });
    });
  });

  describe("anchorAll", () => {
    it("keeps going past a company that fails, then fails the run so it's reported", async () => {
      prisma.gobdLedgerEntry.findMany.mockResolvedValue([{ companyId: "company-a" }, { companyId: "company-b" }]);
      prisma.gobdLedgerEntry.findFirst.mockResolvedValue({ sequence: 9, hash: HASH_9 });
      prisma.gobdLedgerAnchor.findFirst.mockResolvedValue(null);
      jest.mocked(requestTimestamp).mockRejectedValueOnce(new Error("TSA unreachable"));

      await expect(service.anchorAll()).rejects.toThrow(/company-a: TSA unreachable/);
      expect(prisma.gobdLedgerAnchor.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("verify", () => {
    const anchors = [
      { sequence: 5, hash: HASH_5, token: Buffer.from("t5"), timestampedAt: new Date("2026-09-28T03:00:00Z") },
      { sequence: 9, hash: HASH_9, token: Buffer.from("t9"), timestampedAt: STAMPED_AT },
    ];

    beforeEach(() => {
      prisma.gobdLedgerAnchor.findMany.mockResolvedValue(anchors);
      prisma.gobdLedgerEntry.findFirst.mockResolvedValue({ sequence: 12 });
    });

    it("holds when every anchored entry keeps its hash and every token checks out", async () => {
      prisma.gobdLedgerEntry.findMany.mockResolvedValue([{ sequence: 5, hash: HASH_5 }, { sequence: 9, hash: HASH_9 }]);

      await expect(service.verify("company-a")).resolves.toEqual({
        valid: true,
        anchorCount: 2,
        lastSequence: 9,
        lastTimestampedAt: STAMPED_AT,
        entriesSinceLast: 3,
        brokenAtSequence: null,
        reason: null,
      });
      expect(verifyTimestampToken).toHaveBeenCalledWith(Buffer.from("t5"), Buffer.from(HASH_5, "hex"));
    });

    // What recomputing the whole chain after an edit leaves behind: consistent hashes, but not the
    // ones the TSA signed.
    it("catches a chain recomputed after it was timestamped", async () => {
      prisma.gobdLedgerEntry.findMany.mockResolvedValue([{ sequence: 5, hash: "c".repeat(64) }, { sequence: 9, hash: HASH_9 }]);

      await expect(service.verify("company-a")).resolves.toMatchObject({ valid: false, brokenAtSequence: 5, reason: "the entry no longer has the hash that was timestamped" });
    });

    it("catches a token that doesn't check out", async () => {
      prisma.gobdLedgerEntry.findMany.mockResolvedValue([{ sequence: 5, hash: HASH_5 }, { sequence: 9, hash: HASH_9 }]);
      jest.mocked(verifyTimestampToken).mockResolvedValueOnce({ valid: true, timestampedAt: STAMPED_AT }).mockResolvedValueOnce({ valid: false, reason: "the signature doesn't match" });

      await expect(service.verify("company-a")).resolves.toMatchObject({ valid: false, brokenAtSequence: 9, reason: "the signature doesn't match" });
    });
  });
});
