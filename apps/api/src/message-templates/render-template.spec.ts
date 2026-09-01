import { renderTemplate, extractPlaceholders, findUnknownPlaceholders } from "./render-template";

describe("renderTemplate()", () => {
  it("substitutes every matching placeholder", () => {
    expect(renderTemplate("Hi {{name}}, your total is {{total}}.", { name: "Jane", total: "100" })).toBe(
      "Hi Jane, your total is 100.",
    );
  });

  it("leaves an unmatched placeholder untouched instead of dropping it", () => {
    expect(renderTemplate("Hi {{name}}, {{missing}}!", { name: "Jane" })).toBe("Hi Jane, {{missing}}!");
  });

  it("handles a body with no placeholders at all", () => {
    expect(renderTemplate("Plain text.", { name: "Jane" })).toBe("Plain text.");
  });

  it("substitutes the same placeholder repeated multiple times", () => {
    expect(renderTemplate("{{name}} {{name}}", { name: "Jane" })).toBe("Jane Jane");
  });
});

describe("extractPlaceholders()", () => {
  it("returns each distinct placeholder once", () => {
    expect(extractPlaceholders("{{a}} {{b}} {{a}}")).toEqual(["a", "b"]);
  });

  it("returns an empty array for a body with no placeholders", () => {
    expect(extractPlaceholders("plain text")).toEqual([]);
  });
});

describe("findUnknownPlaceholders()", () => {
  it("returns an empty array when every placeholder is allowed", () => {
    expect(findUnknownPlaceholders("Hi {{name}}, {{total}}", ["name", "total"])).toEqual([]);
  });

  it("flags a placeholder not in the allow-list", () => {
    expect(findUnknownPlaceholders("Hi {{name}}, {{secretCode}}", ["name"])).toEqual(["secretCode"]);
  });

  it("is case-sensitive", () => {
    expect(findUnknownPlaceholders("{{Name}}", ["name"])).toEqual(["Name"]);
  });
});
