import { MAX_PAGE_LIMIT, paginate, parsePageParams } from "./pagination";

describe("parsePageParams", () => {
  it("returns undefined when neither limit nor offset is given, so callers skip pagination entirely", () => {
    expect(parsePageParams(undefined, undefined)).toBeUndefined();
  });

  it("defaults offset to 0 when only limit is given", () => {
    expect(parsePageParams("10", undefined)).toEqual({ limit: 10, offset: 0 });
  });

  it("defaults limit to the max page size when only offset is given", () => {
    expect(parsePageParams(undefined, "20")).toEqual({ limit: MAX_PAGE_LIMIT, offset: 20 });
  });

  it("caps an oversized limit at MAX_PAGE_LIMIT", () => {
    expect(parsePageParams("99999", "0")).toEqual({ limit: MAX_PAGE_LIMIT, offset: 0 });
  });

  it("floors an invalid/negative limit to 1 rather than 0 or negative", () => {
    expect(parsePageParams("-5", "0")).toEqual({ limit: 1, offset: 0 });
    expect(parsePageParams("not-a-number", "0")).toEqual({ limit: 1, offset: 0 });
  });

  it("floors a negative offset to 0", () => {
    expect(parsePageParams("10", "-3")).toEqual({ limit: 10, offset: 0 });
  });
});

describe("paginate", () => {
  const rows = [1, 2, 3, 4, 5];

  it("returns every row unchanged when page params are undefined", () => {
    expect(paginate(rows, undefined)).toEqual(rows);
  });

  it("slices by offset and limit", () => {
    expect(paginate(rows, { limit: 2, offset: 1 })).toEqual([2, 3]);
  });

  it("returns an empty array when offset is past the end", () => {
    expect(paginate(rows, { limit: 2, offset: 10 })).toEqual([]);
  });
});
