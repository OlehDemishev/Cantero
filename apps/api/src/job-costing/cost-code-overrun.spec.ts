import { calculateCostCodeOverruns } from "./cost-code-overrun";

describe("calculateCostCodeOverruns", () => {
  it("flags a cost code that has crossed the threshold", () => {
    const result = calculateCostCodeOverruns(
      [
        { costCodeId: "cc-1", code: "03 30 00", name: "Concrete", estimated: 10000, committed: 0, actual: 9500 },
        { costCodeId: "cc-2", code: "06 10 00", name: "Framing", estimated: 10000, committed: 0, actual: 3000 },
      ],
      90,
    );
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("03 30 00");
    expect(result[0].ratioPercent).toBe(95);
    expect(result[0].severity).toBe("warning");
  });

  it("marks a cost code that's already over 100% as critical", () => {
    const result = calculateCostCodeOverruns(
      [{ costCodeId: "cc-1", code: "03 30 00", name: "Concrete", estimated: 10000, committed: 0, actual: 12000 }],
      90,
    );
    expect(result[0].severity).toBe("critical");
  });

  it("skips cost codes with no estimated amount", () => {
    const result = calculateCostCodeOverruns([{ costCodeId: null, code: "—", name: "Uncategorized", estimated: 0, committed: 0, actual: 500 }], 90);
    expect(result).toHaveLength(0);
  });

  it("skips cost codes below the threshold", () => {
    const result = calculateCostCodeOverruns([{ costCodeId: "cc-1", code: "03 30 00", name: "Concrete", estimated: 10000, committed: 0, actual: 5000 }], 90);
    expect(result).toHaveLength(0);
  });
});
