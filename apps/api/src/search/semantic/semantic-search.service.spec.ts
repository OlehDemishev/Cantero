import { createHash } from "node:crypto";
import type { AuthUser } from "@cantero/shared";
import { SemanticSearchService } from "./semantic-search.service";

const MIN_SEARCH_SCORE = 0.78;
const DUPLICATE_SCORE = 0.88;

const user = { userId: "u1", companyId: "co", role: "worker" } as AuthUser;

/** Unit vectors in 3-D with a chosen dot product against the query axis (1,0,0). */
const at = (score: number) => [score, Math.sqrt(1 - score * score), 0];

describe("SemanticSearchService", () => {
  let prisma: any;
  let embedder: { enabled: boolean; model: string; profile: { minSearchScore: number; duplicateScore: number }; embedQuery: jest.Mock; embedPassages: jest.Mock };
  let projectAccess: { filterAccessible: jest.Mock };
  let service: SemanticSearchService;

  beforeEach(() => {
    prisma = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      $transaction: jest.fn(async (ops: unknown[]) => ops),
      searchEmbedding: {
        upsert: jest.fn((a: unknown) => a),
        findMany: jest.fn().mockResolvedValue([
          { entityType: "rfi", entityId: "rfi-close", projectId: "p1", embedding: at(0.83) },
          { entityType: "rfi", entityId: "rfi-far", projectId: "p1", embedding: at(0.74) },
          { entityType: "punch_list_item", entityId: "punch-dup", projectId: "p1", embedding: at(0.93) },
          { entityType: "punch_list_item", entityId: "punch-secret", projectId: "p-secret", embedding: at(0.95) },
          { entityType: "task", entityId: "task-empty", projectId: "p1", embedding: [] },
        ]),
      },
      project: {
        findMany: jest.fn().mockResolvedValue([
          { id: "p1", name: "Tower A", restrictedToMembers: false },
          { id: "p-secret", name: "Secret", restrictedToMembers: true },
        ]),
      },
      rfi: { findMany: jest.fn().mockResolvedValue([{ id: "rfi-close", number: "RFI-7", subject: "Feuchtigkeit Kellerwand", status: "open" }]) },
      punchListItem: {
        findMany: jest.fn().mockResolvedValue([
          { id: "punch-dup", title: "Water through basement wall", location: "B1", status: "open" },
          { id: "punch-secret", title: "Leak", location: null, status: "open" },
        ]),
      },
      dailyLog: { findMany: jest.fn().mockResolvedValue([]) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
    };
    embedder = {
      enabled: true,
      model: "test-model",
      profile: { minSearchScore: MIN_SEARCH_SCORE, duplicateScore: DUPLICATE_SCORE },
      embedQuery: jest.fn().mockResolvedValue([1, 0, 0]),
      embedPassages: jest.fn(async (texts: string[]) => texts.map(() => [1, 0, 0])),
    };
    // The worker isn't on the restricted project.
    projectAccess = { filterAccessible: jest.fn(async (projects: { restrictedToMembers: boolean }[]) => projects.filter((p) => !p.restrictedToMembers)) };
    service = new SemanticSearchService(prisma, embedder as never, projectAccess as never, { add: jest.fn() } as never);
  });

  it("ranks by meaning above the relevance floor and hides restricted projects", async () => {
    const results = await service.search(user, "water in the basement");
    expect(embedder.embedQuery).toHaveBeenCalledWith("water in the basement");
    expect(results.map((r) => [r.id, r.score])).toEqual([
      ["punch-dup", 0.93],
      ["rfi-close", 0.83],
    ]);
    expect(results.every((r) => r.score >= MIN_SEARCH_SCORE)).toBe(true);
    expect(results[1]).toMatchObject({
      title: "RFI-7 Feuchtigkeit Kellerwand",
      subtitle: "Tower A · open",
      link: "/projects/p1?tab=quality&itemType=rfi&itemId=rfi-close",
    });
  });

  it("flags only near-duplicates of the same kind, in the same project, excluding the record itself", async () => {
    const dupes = await service.similar(user, { type: "punch_list_item", projectId: "p1", text: "Wasser dringt durch die Kellerwand" });
    expect(dupes.map((d) => d.id)).toEqual(["punch-dup"]);
    expect(dupes[0].score).toBeGreaterThanOrEqual(DUPLICATE_SCORE);

    expect(await service.similar(user, { type: "punch_list_item", projectId: "p1", text: "Wasser dringt durch die Kellerwand", excludeId: "punch-dup" })).toEqual([]);
    expect(await service.similar(user, { type: "rfi", projectId: "p1", text: "Wasser dringt durch die Kellerwand" })).toEqual([]);
    // Too short to judge.
    expect(await service.similar(user, { type: "punch_list_item", projectId: "p1", text: "Leak" })).toEqual([]);
  });

  it("drops a hit whose record was deleted since it was indexed", async () => {
    prisma.punchListItem.findMany.mockResolvedValue([]);
    const results = await service.search(user, "water in the basement");
    expect(results.map((r) => r.id)).toEqual(["rfi-close"]);
  });

  it("reads a company's vectors once per cache window", async () => {
    await service.search(user, "water in the basement");
    await service.search(user, "something else entirely");
    expect(prisma.searchEmbedding.findMany).toHaveBeenCalledTimes(1);
  });

  it("refuses when turned off", async () => {
    embedder.enabled = false;
    await expect(service.search(user, "anything")).rejects.toThrow(/turned off/);
  });

  describe("indexPending", () => {
    it("embeds changed records with the hash Postgres computes, and stores empty text without a vector", async () => {
      prisma.$queryRawUnsafe.mockImplementation(async (sql: string, type: string) =>
        type === "rfi" && !prisma.$queryRawUnsafe.mock.calls.slice(0, -1).some((c: unknown[]) => c[1] === "rfi")
          ? [
              { id: "r1", companyId: "co", projectId: "p1", text: "Feuchtigkeit Kellerwand" },
              { id: "r2", companyId: "co", projectId: "p1", text: "" },
            ]
          : [],
      );
      const result = await service.indexPending();

      expect(result.indexed).toBe(2);
      expect(embedder.embedPassages).toHaveBeenCalledWith(["Feuchtigkeit Kellerwand"]);
      const [first, second] = prisma.searchEmbedding.upsert.mock.calls.map((c: any[]) => c[0]);
      expect(first.create).toMatchObject({
        entityType: "rfi",
        entityId: "r1",
        // The model is part of the hash: switching models re-embeds everything.
        contentHash: createHash("md5").update("test-model\nFeuchtigkeit Kellerwand").digest("hex"),
        embedding: [1, 0, 0],
      });
      expect(second.create).toMatchObject({ entityId: "r2", embedding: [] });
      // Change detection happens in SQL, on the same text expression that is embedded.
      const sql: string = prisma.$queryRawUnsafe.mock.calls[0][0];
      expect(sql).toContain("md5($3 || E'\\n' || concat_ws(E'\\n', r.subject, r.question, r.answer))");
      expect(prisma.$queryRawUnsafe.mock.calls[0][3]).toBe("test-model");
      // Deleted records are cleaned up for every type.
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(4);
    });
  });
});
