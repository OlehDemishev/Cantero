import type { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import { QueueFailureReporterService } from "./queue-failure-reporter.service";

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

  it("attaches a 'failed' listener to every registered queue on init", () => {
    service.onModuleInit();

    // Tied to the real registered-queue count (15 today) rather than "at least one" — a queue
    // added to queue.module.ts without being added to ALL_QUEUE_NAMES here would silently regress
    // back to unreported failures, and this test would still pass if it only checked ">= 1".
    const { QueueEvents } = jest.requireMock("bullmq") as { QueueEvents: jest.Mock };
    expect(QueueEvents).toHaveBeenCalledTimes(15);
    expect(mockOn).toHaveBeenCalledTimes(15);
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
    expect(mockClose).toHaveBeenCalledTimes(15);
  });
});
