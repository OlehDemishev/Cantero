import { BadRequestException } from "@nestjs/common";
import { DateQueryPipe, IdListQueryPipe, OptionalIntPipe } from "./query-pipes";

const meta = (data: string) => ({ type: "query" as const, data });

describe("query pipes", () => {
  it("OptionalIntPipe: absent stays undefined, digits parse, garbage is a 400", async () => {
    await expect(OptionalIntPipe.transform(undefined as unknown as string, meta("days"))).resolves.toBeUndefined();
    await expect(OptionalIntPipe.transform("30", meta("days"))).resolves.toBe(30);
    await expect(OptionalIntPipe.transform("abc", meta("days"))).rejects.toThrow(BadRequestException);
  });

  it("DateQueryPipe: passes a real date through unchanged and rejects anything else", () => {
    const pipe = new DateQueryPipe();
    expect(pipe.transform(undefined, meta("from"))).toBeUndefined();
    expect(pipe.transform("", meta("from"))).toBeUndefined();
    expect(pipe.transform("2026-09-01", meta("from"))).toBe("2026-09-01");
    expect(() => pipe.transform("x", meta("from"))).toThrow(/"from" must be a date/);
  });

  it("IdListQueryPipe: splits, trims and drops empties; absent is an empty list", () => {
    const pipe = new IdListQueryPipe();
    expect(pipe.transform(undefined)).toEqual([]);
    expect(pipe.transform("a, b,,c")).toEqual(["a", "b", "c"]);
  });
});
