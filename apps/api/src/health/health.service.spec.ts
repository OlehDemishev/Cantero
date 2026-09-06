import { HealthService } from "./health.service";
import { PrismaService } from "../common/prisma/prisma.service";

const mockRedisInstance = {
  connect: jest.fn(),
  ping: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock("ioredis", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockRedisInstance),
}));

describe("HealthService", () => {
  let service: HealthService;
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn() };
    service = new HealthService(prisma as unknown as PrismaService);
    jest.clearAllMocks();
    mockRedisInstance.connect.mockResolvedValue(undefined);
    mockRedisInstance.ping.mockResolvedValue("PONG");
  });

  it("reports ok when both the database and redis are reachable", async () => {
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const report = await service.check();

    expect(report).toEqual({ status: "ok", checks: { database: { ok: true }, redis: { ok: true } } });
  });

  it("reports the database as failing without also failing redis", async () => {
    prisma.$queryRaw.mockRejectedValue(new Error("connection refused"));

    const report = await service.check();

    expect(report.status).toBe("error");
    expect(report.checks.database).toEqual({ ok: false, error: "connection refused" });
    expect(report.checks.redis).toEqual({ ok: true });
  });

  it("reports redis as failing without also failing the database", async () => {
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockRedisInstance.connect.mockRejectedValue(new Error("ECONNREFUSED"));

    const report = await service.check();

    expect(report.status).toBe("error");
    expect(report.checks.redis).toEqual({ ok: false, error: "ECONNREFUSED" });
    expect(report.checks.database).toEqual({ ok: true });
  });

  it("always disconnects its dedicated redis probe connection, even on failure", async () => {
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockRedisInstance.ping.mockRejectedValue(new Error("timeout"));

    await service.check();

    expect(mockRedisInstance.disconnect).toHaveBeenCalled();
  });
});
