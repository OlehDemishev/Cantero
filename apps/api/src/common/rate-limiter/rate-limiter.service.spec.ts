import { HttpException } from "@nestjs/common";
import { RateLimiterService } from "./rate-limiter.service";

describe("RateLimiterService", () => {
  let service: RateLimiterService;

  beforeEach(() => {
    service = new RateLimiterService();
    jest.useFakeTimers().setSystemTime(0);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it("allows attempts up to the limit", () => {
    for (let i = 0; i < 5; i++) {
      expect(() => service.consume("k1", 5, 1000)).not.toThrow();
    }
  });

  it("throws 429 once the limit is exceeded within the window", () => {
    for (let i = 0; i < 5; i++) service.consume("k1", 5, 1000);
    expect(() => service.consume("k1", 5, 1000)).toThrow(HttpException);
    try {
      service.consume("k1", 5, 1000);
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(429);
    }
  });

  it("resets the count once the window elapses", () => {
    for (let i = 0; i < 5; i++) service.consume("k1", 5, 1000);
    expect(() => service.consume("k1", 5, 1000)).toThrow(HttpException);

    jest.setSystemTime(1001);

    expect(() => service.consume("k1", 5, 1000)).not.toThrow();
  });

  it("tracks separate keys independently", () => {
    for (let i = 0; i < 5; i++) service.consume("k1", 5, 1000);
    expect(() => service.consume("k1", 5, 1000)).toThrow(HttpException);
    expect(() => service.consume("k2", 5, 1000)).not.toThrow();
  });

  it("reset() clears a key's count immediately", () => {
    for (let i = 0; i < 5; i++) service.consume("k1", 5, 1000);
    service.reset("k1");
    expect(() => service.consume("k1", 5, 1000)).not.toThrow();
  });

  it("sweeps expired buckets on its own timer without needing reset()", () => {
    service.consume("k1", 1, 1000);
    expect(() => service.consume("k1", 1, 1000)).toThrow(HttpException);

    jest.setSystemTime(1001);
    jest.advanceTimersByTime(5 * 60 * 1000);

    expect(() => service.consume("k1", 1, 1000)).not.toThrow();
  });
});
