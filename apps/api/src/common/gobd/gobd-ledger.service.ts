import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuditActor } from "../audit/audit.service";

export interface GobdLedgerVerification {
  valid: boolean;
  /** The first sequence number whose stored hash no longer matches what's recomputed from its own
   * content and the previous row's hash — i.e. everything from here on is unverifiable. Null when
   * `valid` is true, or when the chain is empty. */
  brokenAtSequence: number | null;
  entryCount: number;
}

interface HashInput {
  companyId: string;
  sequence: number;
  entityType: string;
  entityId: string;
  event: string;
  summary: string;
  payload: unknown;
  actorName: string;
  previousHash: string | null;
}

/** Deep-sorts object keys so the same logical value always serializes identically regardless of
 * property insertion order — needed because Postgres jsonb does not guarantee it preserves the
 * key order a payload was written with, and a hash chain must reproduce the exact same digest
 * forever from what comes back out of the database, not just from what went in. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function computeHash(input: HashInput): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(input))).digest("hex");
}

/**
 * GoBD-grade tamper-evident journal for Festschreibung events (see GobdLedgerEntry's schema
 * comment for what this is and isn't for). append() must run inside the SAME transaction as the
 * business change it documents, and that transaction must use SERIALIZABLE isolation (see
 * runSerializable) — otherwise two concurrent appends for the same company could both read the
 * same "last entry" under a weaker isolation level and each extend the chain from it, silently
 * forking it instead of producing one linear history.
 */
@Injectable()
export class GobdLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async append(
    tx: Prisma.TransactionClient,
    companyId: string,
    actor: AuditActor,
    event: string,
    entityType: string,
    entityId: string,
    summary: string,
    payload: Record<string, unknown>,
  ) {
    const last = await tx.gobdLedgerEntry.findFirst({ where: { companyId }, orderBy: { sequence: "desc" } });
    const sequence = (last?.sequence ?? 0) + 1;
    const previousHash = last?.hash ?? null;
    const hash = computeHash({ companyId, sequence, entityType, entityId, event, summary, payload, actorName: actor.name, previousHash });
    return tx.gobdLedgerEntry.create({
      data: {
        companyId,
        sequence,
        entityType,
        entityId,
        event,
        summary,
        payload: payload as Prisma.InputJsonValue,
        actorName: actor.name,
        previousHash,
        hash,
      },
    });
  }

  list(companyId: string, take: number, cursor?: string) {
    return this.prisma.gobdLedgerEntry.findMany({
      where: { companyId },
      orderBy: { sequence: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
  }

  async verifyChain(companyId: string): Promise<GobdLedgerVerification> {
    const entries = await this.prisma.gobdLedgerEntry.findMany({ where: { companyId }, orderBy: { sequence: "asc" } });
    let previousHash: string | null = null;
    for (const entry of entries) {
      if (entry.previousHash !== previousHash) {
        return { valid: false, brokenAtSequence: entry.sequence, entryCount: entries.length };
      }
      const recomputed = computeHash({
        companyId: entry.companyId,
        sequence: entry.sequence,
        entityType: entry.entityType,
        entityId: entry.entityId,
        event: entry.event,
        summary: entry.summary,
        payload: entry.payload,
        actorName: entry.actorName,
        previousHash: entry.previousHash,
      });
      if (recomputed !== entry.hash) {
        return { valid: false, brokenAtSequence: entry.sequence, entryCount: entries.length };
      }
      previousHash = entry.hash;
    }
    return { valid: true, brokenAtSequence: null, entryCount: entries.length };
  }
}
