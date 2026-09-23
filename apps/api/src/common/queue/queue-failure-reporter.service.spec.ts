import type { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QueueFailureReporterService } from "./queue-failure-reporter.service";
import { QUEUE_NAMES } from "./queue.module";

jest.mock("@sentry/node", () => ({ captureException: jest.fn() }));

const mockOn = jest.fn();
const mockClose = jest.fn().mockResolvedValue(undefined);
jest.mock("bullmq", () => ({
  QueueEvents: jest.fn().mockImplementation(() => ({ on: mockOn, close: mockClose })),
}));
jest.mock("ioredis", () => jest.fn().mockImplementation(() => ({})));

describe("QueueFailureReporterService", () => {
  let service: QueueFailureReporterService;
  let config: { getOrThrow: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    config = { getOrThrow: jest.fn().mockReturnValue("redis://localhost:6379") };
    service = new QueueFailureReporterService(config as unknown as ConfigService);
  });

  it("attaches a 'failed' listener to every queue the app declares", () => {
    service.onModuleInit();

    // Every *_QUEUE constant in queue.module.ts, read from the source: a queue declared there but
    // left out of QUEUE_NAMES would be neither registered nor watched, and this catches it.
    const declared = [...readFileSync(join(__dirname, "queue.module.ts"), "utf-8").matchAll(/^export const \w+_QUEUE = "([^"]+)";/gm)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThanOrEqual(19);
    const { QueueEvents } = jest.requireMock("bullmq") as { QueueEvents: jest.Mock };
    expect(QueueEvents.mock.calls.map((c) => c[0]).sort()).toEqual([...declared].sort());
    expect(mockOn).toHaveBeenCalledTimes(declared.length);
    expect(mockOn).toHaveBeenCalledWith("failed", expect.any(Function));
  });

  it("reports a job failure to Sentry with the queue and job id as context", () => {
    service.onModuleInit();
    const failedHandler = mockOn.mock.calls[0][1] as (args: { jobId: string; failedReason: string }) => void;

    failedHandler({ jobId: "42", failedReason: "boom" });

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("boom") }),
      expect.objectContaining({ tags: expect.objectContaining({ jobId: "42" }) }),
    );
  });

  it("closes every listener on module destroy", async () => {
    service.onModuleInit();
    await service.onModuleDestroy();
    expect(mockClose).toHaveBeenCalledTimes(QUEUE_NAMES.length);
  });
});
