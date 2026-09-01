import { categorizeDescription } from "./categorize-transaction";

const RULES = [
  { id: "r1", pattern: "Home Depot", category: "materials" },
  { id: "r2", pattern: "Shell", category: "fuel" },
  { id: "r3", pattern: "Depot", category: "other" }, // deliberately broader, listed second
];

describe("categorizeDescription", () => {
  it("matches a rule whose pattern is a substring of the description, case-insensitively", () => {
    const result = categorizeDescription("HOME DEPOT #4521 PURCHASE", RULES);
    expect(result?.category).toBe("materials");
  });

  it("returns the first matching rule in the given order when multiple rules could match", () => {
    // Both r1 ("Home Depot") and r3 ("Depot") match — r1 comes first in the list, so it wins.
    const result = categorizeDescription("Home Depot #4521", RULES);
    expect(result?.id).toBe("r1");
  });

  it("falls through to a later, broader rule when the earlier specific one doesn't match", () => {
    const result = categorizeDescription("Ace Depot Hardware", RULES);
    expect(result?.id).toBe("r3");
  });

  it("returns null when no rule matches", () => {
    expect(categorizeDescription("Random Coffee Shop", RULES)).toBeNull();
  });

  it("returns null for an empty rule list", () => {
    expect(categorizeDescription("Home Depot", [])).toBeNull();
  });

  it("ignores a rule with an empty pattern rather than matching everything", () => {
    const result = categorizeDescription("Anything at all", [{ id: "r0", pattern: "", category: "other" }]);
    expect(result).toBeNull();
  });
});
