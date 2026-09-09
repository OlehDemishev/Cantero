import type { CallHandler } from "@nestjs/common";
import { of, throwError, firstValueFrom } from "rxjs";
import { IdempotencyInterceptor } from "./idempotency.interceptor";
import { IdempotencyService } from "./idempotency.service";

function makeContext(request: Record<string, unknown>) {
  return { switchToHttp: () => ({ getRequest: () => request }) } as any;
}

describe("IdempotencyInterceptor", () => {
  let idempotency: IdempotencyService;
  let interceptor: IdempotencyInterceptor;
  let handlerFn: jest.Mock;
  let next: CallHandler<unknown>;

  beforeEach(() => {
    idempotency = new IdempotencyService();
    interceptor = new IdempotencyInterceptor(idempotency);
    handlerFn = jest.fn().mockReturnValue({ id: "created-1" });
    next = { handle: () => of(handlerFn()) };
  });

  afterEach(() => {
    idempotency.onModuleDestroy();
  });

  it("passes a request with no Idempotency-Key straight through, every time", async () => {
    const request = { method: "POST", url: "/expenses", headers: {}, user: { userId: "u1" } };

    await firstValueFrom(interceptor.intercept(makeContext(request), next));
    await firstValueFrom(interceptor.intercept(makeContext(request), next));

    expect(handlerFn).toHaveBeenCalledTimes(2);
  });

  it("passes a GET request through even with an Idempotency-Key present", async () => {
    const request = { method: "GET", url: "/expenses", headers: { "idempotency-key": "k1" }, user: { userId: "u1" } };

    await firstValueFrom(interceptor.intercept(makeContext(request), next));
    await firstValueFrom(interceptor.intercept(makeContext(request), next));

    expect(handlerFn).toHaveBeenCalledTimes(2);
  });

  it("runs the handler once and replays the same result for a repeated key", async () => {
    const request = { method: "POST", url: "/expenses", headers: { "idempotency-key": "mut-1" }, user: { userId: "u1" } };

    const first = await firstValueFrom(interceptor.intercept(makeContext(request), next));
    const second = await firstValueFrom(interceptor.intercept(makeContext(request), next));

    expect(handlerFn).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ id: "created-1" });
    expect(second).toEqual({ id: "created-1" });
  });

  it("does not let one user's key replay a result to a different user", async () => {
    const requestA = { method: "POST", url: "/expenses", headers: { "idempotency-key": "mut-1" }, user: { userId: "user-a" } };
    const requestB = { method: "POST", url: "/expenses", headers: { "idempotency-key": "mut-1" }, user: { userId: "user-b" } };

    await firstValueFrom(interceptor.intercept(makeContext(requestA), next));
    await firstValueFrom(interceptor.intercept(makeContext(requestB), next));

    expect(handlerFn).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed attempt — a retry with the same key runs the handler again", async () => {
    const request = { method: "POST", url: "/expenses", headers: { "idempotency-key": "mut-1" }, user: { userId: "u1" } };
    const failingNext = { handle: () => throwError(() => new Error("validation failed")) };

    await expect(firstValueFrom(interceptor.intercept(makeContext(request), failingNext))).rejects.toThrow("validation failed");

    // A second attempt with the same key, now succeeding, must still reach the real handler —
    // the failed first attempt cached nothing to replay.
    const result = await firstValueFrom(interceptor.intercept(makeContext(request), next));
    expect(handlerFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: "created-1" });
  });
});
