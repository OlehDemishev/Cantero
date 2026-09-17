import { GobdLedgerService } from "./gobd-ledger.service";
import { PrismaService } from "../prisma/prisma.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Jane" };

describe("GobdLedgerService", () => {
  let service: GobdLedgerService;
  let store: Record<string, unknown>[];
  let tx: { gobdLedgerEntry: { findFirst: jest.Mock; create: jest.Mock } };
  let prisma: { gobdLedgerEntry: { findMany: jest.Mock } };

  beforeEach(() => {
    store = [];
    tx = {
      gobdLedgerEntry: {
        findFirst: jest.fn(async () => (store.length > 0 ? store[store.length - 1] : null)),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `row-${store.length + 1}`, createdAt: new Date(), ...data };
          store.push(row as never);
          return row;
        }),
      },
    };
    prisma = { gobdLedgerEntry: { findMany: jest.fn(async () => store) } };
    service = new GobdLedgerService(prisma as unknown as PrismaService);
  });

  it("starts the chain with a null previousHash and sequence 1", async () => {
    const entry = await service.append(tx as never, COMPANY_A, ACTOR, "invoice.locked", "Invoice", "inv-1", "Locked INV-0001", { total: "100.00" });
    expect(entry.sequence).toBe(1);
    expect(entry.previousHash).toBeNull();
    expect(typeof entry.hash).toBe("string");
    expect(entry.hash).toHaveLength(64); // sha256 hex
  });

  it("chains each new entry to the previous one's hash and increments sequence", async () => {
    const first = await service.append(tx as never, COMPANY_A, ACTOR, "invoice.locked", "Invoice", "inv-1", "Locked INV-0001", { total: "100.00" });
    const second = await service.append(tx as never, COMPANY_A, ACTOR, "invoice.voided", "Invoice", "inv-1", "Voided INV-0001", { reason: "duplicate" });
    expect(second.sequence).toBe(2);
    expect(second.previousHash).toBe(first.hash);
  });

  it("produces a different hash for a different payload, even with everything else identical", async () => {
    const a = await service.append(tx as never, COMPANY_A, ACTOR, "invoice.locked", "Invoice", "inv-1", "Locked", { total: "100.00" });
    store = [];
    const b = await service.append(tx as never, COMPANY_A, ACTOR, "invoice.locked", "Invoice", "inv-1", "Locked", { total: "200.00" });
    expect(a.hash).not.toBe(b.hash);
  });

  it("is insensitive to the payload's own key order (canonicalized before hashing)", async () => {
    const a = await service.append(tx as never, COMPANY_A, ACTOR, "invoice.locked", "Invoice", "inv-1", "Locked", { total: "100.00", currency: "EUR" });
    store = [];
    const b = await service.append(tx as never, COMPANY_A, ACTOR, "invoice.locked", "Invoice", "inv-1", "Locked", { currency: "EUR", total: "100.00" });
    expect(a.hash).toBe(b.hash);
  });

  describe("verifyChain()", () => {
    it("reports valid: true for an empty chain", async () => {
      const result = await service.verifyChain(COMPANY_A);
      expect(result).toEqual({ valid: true, brokenAtSequence: null, entryCount: 0 });
    });

    it("reports valid: true for an untampered chain", async () => {
      await service.append(tx as never, COMPANY_A, ACTOR, "invoice.locked", "Invoice", "inv-1", "Locked", { total: "100.00" });
      await service.append(tx as never, COMPANY_A, ACTOR, "invoice.locked", "Invoice", "inv-2", "Locked", { total: "50.00" });
      const result = await service.verifyChain(COMPANY_A);
      expect(result).toEqual({ valid: true, brokenAtSequence: null, entryCount: 2 });
    });

    it("detects a payload edited after the fact", async () => {
      await service.append(tx as never, COMPANY_A, ACTOR, "invoice.locked", "Invoice", "inv-1", "Locked", { total: "100.00" });
      await service.append(tx as never, COMPANY_A, ACTOR, "invoice.locked", "Invoice", "inv-2", "Locked", { total: "50.00" });
      store[0].payload = { total: "999999.00" };
      const result = await service.verifyChain(COMPANY_A);
      expect(result.valid).toBe(false);
      expect(result.brokenAtSequence).toBe(1);
    });

    it("detects a row deleted from the middle of the chain (later previousHash no longer matches)", async () => {
      await service.append(tx as never, COMPANY_A, ACTOR, "invoice.locked", "Invoice", "inv-1", "Locked", { total: "100.00" });
      await service.append(tx as never, COMPANY_A, ACTOR, "invoice.locked", "Invoice", "inv-2", "Locked", { total: "50.00" });
      await service.append(tx as never, COMPANY_A, ACTOR, "invoice.locked", "Invoice", "inv-3", "Locked", { total: "25.00" });
      store.splice(1, 1); // delete the middle entry
      const result = await service.verifyChain(COMPANY_A);
      expect(result.valid).toBe(false);
      expect(result.brokenAtSequence).toBe(3); // the sequence-3 row's previousHash no longer matches sequence-1's hash
    });
  });
});
