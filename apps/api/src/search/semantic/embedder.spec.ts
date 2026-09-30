import { ServiceUnavailableException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { pipeline } from "@huggingface/transformers";
import { Embedder } from "./embedder";

jest.mock("@huggingface/transformers", () => ({ env: {}, pipeline: jest.fn() }));
jest.mock("ioredis", () => jest.fn());
jest.mock("bullmq", () => ({
  ...jest.requireActual("bullmq"),
  QueueEvents: jest.fn().mockImplementation(() => ({ waitUntilReady: jest.fn().mockResolvedValue(undefined), close: jest.fn() })),
}));

const VECTOR = [0.6, 0.8];

describe("Embedder", () => {
  const originalRole = process.env.PROCESS_ROLE;
  let settings: Record<string, string>;
  let queue: { add: jest.Mock };
  let finished: jest.Mock;
  let embedder: Embedder;

  beforeEach(() => {
    settings = { EMBEDDINGS_MODEL: "Xenova/multilingual-e5-small", REDIS_URL: "redis://redis:6379" };
    finished = jest.fn().mockResolvedValue([VECTOR]);
    queue = { add: jest.fn().mockResolvedValue({ waitUntilFinished: finished }) };
    const config = { get: (key: string) => settings[key], getOrThrow: (key: string) => settings[key] } as unknown as ConfigService;
    embedder = new Embedder(config, queue as never);
    jest.mocked(pipeline).mockReset().mockResolvedValue((async () => ({ tolist: () => [VECTOR] })) as never);
  });

  afterEach(() => {
    if (originalRole === undefined) delete process.env.PROCESS_ROLE;
    else process.env.PROCESS_ROLE = originalRole;
  });

  describe("in the API process", () => {
    beforeEach(() => (process.env.PROCESS_ROLE = "api"));

    it("has the worker embed a search query instead of loading the model", async () => {
      await expect(embedder.embedQuery("Abdichtung der Kellerwände")).resolves.toEqual(VECTOR);

      expect(queue.add).toHaveBeenCalledWith("embed", { texts: ["query: Abdichtung der Kellerwände"] }, expect.any(Object));
      expect(pipeline).not.toHaveBeenCalled();
    });

    it("says search is unavailable when the worker doesn't answer", async () => {
      finished.mockRejectedValue(new Error("Job wait embed timed out before finishing"));
      await expect(embedder.embedPassages(["A new punch item"])).rejects.toThrow(ServiceUnavailableException);
    });

    it("sends nothing when there's nothing to embed", async () => {
      await expect(embedder.embedPassages([])).resolves.toEqual([]);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it("doesn't load the model as it starts", () => {
      embedder.onApplicationBootstrap();
      expect(pipeline).not.toHaveBeenCalled();
    });
  });

  describe("in the worker", () => {
    beforeEach(() => (process.env.PROCESS_ROLE = "worker"));

    it("loads the model as it starts, so the first search doesn't wait for it", async () => {
      embedder.onApplicationBootstrap();
      // Loading runs in the background, behind the module import.
      await new Promise((resolve) => setImmediate(resolve));
      expect(pipeline).toHaveBeenCalledWith("feature-extraction", "Xenova/multilingual-e5-small", { dtype: "q8" });
    });

    it("doesn't load it when meaning-based search is off", () => {
      settings.SEMANTIC_SEARCH_ENABLED = "false";
      embedder.onApplicationBootstrap();
      expect(pipeline).not.toHaveBeenCalled();
    });

    it("computes the vectors the API asked for, texts as given", async () => {
      await expect(embedder.embedHere(["passage: A new punch item"])).resolves.toEqual([VECTOR]);
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  it("embeds in-process when one process runs everything", async () => {
    delete process.env.PROCESS_ROLE;
    await expect(embedder.embedQuery("Kellerwände")).resolves.toEqual(VECTOR);
    expect(queue.add).not.toHaveBeenCalled();
    expect(pipeline).toHaveBeenCalledTimes(1);
  });
});
