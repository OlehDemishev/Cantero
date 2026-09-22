import { createHash } from "node:crypto";
import type { AuthUser } from "@cantero/shared";
import { SemanticSearchService } from "./semantic-search.service";

const MIN_SEARCH_SCORE = 0.78;
const SEARCH_WINDOW = 0.12;
const DUPLICATE_SCORE = 0.88;

const user = { userId: "u1", companyId: "co", role: "worker" } as AuthUser;

/** Unit vectors in 3-D with a chosen dot product against the query axis (1,0,0). */
const at = (score: number) => [score, Math.sqrt(1 - score * score), 0];
/** A stored row: full-text vector at `score`, optional title vector, hash = its own text. */
const row = (entityType: string, entityId: string, projectId: string, score: number, extra: { title?: number; text?: string } = {}) => ({
  entityType,
  entityId,
  projectId,
  contentHash: extra.text ?? entityId,
  embedding: at(score),
  titleEmbedding: extra.title === undefined ? [] : at(extra.title),
});

describe("SemanticSearchService", () => {
  let prisma: any;
  let embedder: {
    enabled: boolean;
    model: string;
    profile: { minSearchScore: number; searchWindow: number; duplicateScore: number };
    embedQuery: jest.Mock;
    embedPassages: jest.Mock;
  };
  let projectAccess: { filterAccessible: jest.Mock };
  let service: SemanticSearchService;
  let queue: { add: jest.Mock };

  beforeEach(() => {
    prisma = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      $transaction: jest.fn(async (ops: unknown[]) => ops),
      searchEmbedding: {
        upsert: jest.fn((a: unknown) => a),
        findMany: jest.fn().mockResolvedValue([
          row("rfi", "rfi-close", "p1", 0.83),
          row("rfi", "rfi-far", "p1", 0.74),
          row("punch_list_item", "punch-dup", "p1", 0.93),
          row("punch_list_item", "punch-secret", "p-secret", 0.99),
          { ...row("task", "task-empty", "p1", 0), embedding: [] },
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
      profile: { minSearchScore: MIN_SEARCH_SCORE, searchWindow: SEARCH_WINDOW, duplicateScore: DUPLICATE_SCORE },
      embedQuery: jest.fn().mockResolvedValue([1, 0, 0]),
      embedPassages: jest.fn(async (texts: string[]) => texts.map(() => [1, 0, 0])),
    };
    // The worker isn't on the restricted project.
    projectAccess = { filterAccessible: jest.fn(async (projects: { restrictedToMembers: boolean }[]) => projects.filter((p) => !p.restrictedToMembers)) };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    service = new SemanticSearchService(prisma, embedder as never, projectAccess as never, queue as never);
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
      sameTextCount: 0,
    });
  });

  it("keeps only hits close to the best visible one", async () => {
    embedder.profile.searchWindow = 0.05;
    // 0.83 is more than 0.05 below 0.93; the hidden 0.99 must not set the bar (0.94 would drop 0.93).
    expect((await service.search(user, "water in the basement")).map((r) => r.id)).toEqual(["punch-dup"]);
  });

  it("scores a record by its title when the title matches better than the whole text", async () => {
    prisma.searchEmbedding.findMany.mockResolvedValue([row("rfi", "rfi-close", "p1", 0.6, { title: 0.86 }), row("punch_list_item", "punch-dup", "p1", 0.84)]);
    const results = await service.search(user, "damp basement wall");
    expect(results.map((r) => [r.id, r.score])).toEqual([
      ["rfi-close", 0.86],
      ["punch-dup", 0.84],
    ]);
  });

  it("folds records with identical text into one result", async () => {
    prisma.searchEmbedding.findMany.mockResolvedValue([
      row("rfi", "rfi-close", "p1", 0.85, { text: "same" }),
      row("rfi", "rfi-copy-1", "p1", 0.85, { text: "same" }),
      row("rfi", "rfi-copy-2", "p1", 0.85, { text: "same" }),
      row("punch_list_item", "punch-dup", "p1", 0.84, { text: "same" }),
    ]);
    const results = await service.search(user, "damp basement wall");
    expect(results.map((r) => [r.id, r.sameTextCount])).toEqual([
      ["rfi-close", 2],
      // Same text, but a different kind of record: kept on its own.
      ["punch-dup", 0],
    ]);
  });

  it("flags only near-duplicates of the same kind, in the same project, excluding the record itself", async () => {
    const dupes = await service.similar(user, { type: "punch_list_item", projectId: "p1", text: "Wasser dringt durch die Kellerwand" });
    expect(dupes.map((d) => d.id)).toEqual(["punch-dup"]);
    expect(dupes[0].score).toBeGreaterThanOrEqual(DUPLICATE_SCORE);

    expect(await service.similar(user, { type: "punch_list_item", projectId: "p1", text: "Wasser dringt durch die Kellerwand", excludeId: "punch-dup" })).toEqual([]);
    expect(await service.similar(user, { type: "rfi", projectId: "p1", text: "Wasser dringt durch die Kellerwand" })).toEqual([]);
    // A matching title alone doesn't make a duplicate.
    prisma.searchEmbedding.findMany.mockResolvedValue([row("punch_list_item", "punch-dup", "p1", 0.6, { title: 0.99 })]);
    (service as any).cache.clear();
    expect(await service.similar(user, { type: "punch_list_item", projectId: "p1", text: "Wasser dringt durch die Kellerwand" })).toEqual([]);
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

  it("asks for an indexing run as soon as someone searches, one at a time", async () => {
    await service.search(user, "water in the basement");
    await service.similar(user, { type: "punch_list_item", projectId: "p1", text: "Wasser dringt durch die Kellerwand" });
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith("index-now", {}, expect.objectContaining({ jobId: "semantic-index-now" }));
    // Too short to search: no run asked for either.
    await service.search(user, "ab");
    expect(queue.add).toHaveBeenCalledTimes(2);
  });

  it("still answers when the queue is unreachable", async () => {
    queue.add.mockRejectedValue(new Error("Redis down"));
    await expect(service.search(user, "water in the basement")).resolves.toHaveLength(2);
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
              { id: "r1", companyId: "co", projectId: "p1", text: "Feuchtigkeit Kellerwand\nIst das Grundwasser?", title: "Feuchtigkeit Kellerwand" },
              { id: "r2", companyId: "co", projectId: "p1", text: "", title: "" },
              { id: "r3", companyId: "co", projectId: "p1", text: "Dachdämmung", title: "Dachdämmung" },
            ]
          : [],
      );
      embedder.embedPassages.mockImplementation(async (texts: string[]) => texts.map((_, i) => [i, 0, 0]));
      const result = await service.indexPending();

      expect(result.indexed).toBe(3);
      // Full texts, then the one title that says less than its text.
      expect(embedder.embedPassages).toHaveBeenCalledWith(["Feuchtigkeit Kellerwand\nIst das Grundwasser?", "Dachdämmung", "Feuchtigkeit Kellerwand"]);
      const [first, second, third] = prisma.searchEmbedding.upsert.mock.calls.map((c: any[]) => c[0]);
      expect(first.create).toMatchObject({
        entityType: "rfi",
        entityId: "r1",
        // The model and the index format are part of the hash: changing either re-embeds everything.
        contentHash: createHash("md5").update("test-model#2\nFeuchtigkeit Kellerwand\nIst das Grundwasser?").digest("hex"),
        embedding: [0, 0, 0],
        titleEmbedding: [2, 0, 0],
      });
      expect(second.create).toMatchObject({ entityId: "r2", embedding: [], titleEmbedding: [] });
      // The text is just the title: no second vector.
      expect(third.create).toMatchObject({ entityId: "r3", embedding: [1, 0, 0], titleEmbedding: [] });
      // Change detection happens in SQL, on the same text expression that is embedded.
      const sql: string = prisma.$queryRawUnsafe.mock.calls[0][0];
      expect(sql).toContain("md5($3 || E'\\n' || concat_ws(E'\\n', r.subject, r.question, r.answer))");
      expect(sql).toContain("r.subject AS title");
      expect(prisma.$queryRawUnsafe.mock.calls[0][3]).toBe("test-model#2");
      // Deleted records are cleaned up for every type.
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(4);
    });
  });
});
