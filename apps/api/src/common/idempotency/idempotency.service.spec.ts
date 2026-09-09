import { IdempotencyService } from "./idempotency.service";

describe("IdempotencyService", () => {
  let service: IdempotencyService;

  beforeEach(() => {
    service = new IdempotencyService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it("reports no hit for a key that was never stored", () => {
    expect(service.get("k1")).toEqual({ hit: false });
  });

  it("returns a stored result on a later get()", () => {
    service.set("k1", { id: "expense-1" });
    expect(service.get("k1")).toEqual({ hit: true, result: { id: "expense-1" } });
  });

  it("keeps different keys independent", () => {
    service.set("k1", "a");
    service.set("k2", "b");
    expect(service.get("k1")).toEqual({ hit: true, result: "a" });
    expect(service.get("k2")).toEqual({ hit: true, result: "b" });
  });

  it("expires an entry after its TTL", () => {
    jest.useFakeTimers().setSystemTime(0);
    service.set("k1", "a");
    jest.setSystemTime(25 * 60 * 60 * 1000); // 25h later, past the 24h TTL
    expect(service.get("k1")).toEqual({ hit: false });
    jest.useRealTimers();
  });
});
