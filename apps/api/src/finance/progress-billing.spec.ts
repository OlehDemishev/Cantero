import { calculateProgressDraw } from "./progress-billing";

describe("calculateProgressDraw", () => {
  it("bills only the incremental slice since the last draw", () => {
    const calc = calculateProgressDraw(100000, 0, 25, 10);
    expect(calc.grossAmount).toBe(25000);
    expect(calc.retainageAmount).toBe(2500);
    expect(calc.netAmount).toBe(22500);
  });

  it("bills the delta, not the cumulative amount, on a later draw", () => {
    const calc = calculateProgressDraw(100000, 25, 60, 10);
    expect(calc.grossAmount).toBe(35000);
    expect(calc.retainageAmount).toBe(3500);
    expect(calc.netAmount).toBe(31500);
  });

  it("withholds nothing when retainagePercent is 0", () => {
    const calc = calculateProgressDraw(50000, 0, 100, 0);
    expect(calc.grossAmount).toBe(50000);
    expect(calc.retainageAmount).toBe(0);
    expect(calc.netAmount).toBe(50000);
  });

  it("rounds to the nearest cent", () => {
    const calc = calculateProgressDraw(10000.33, 0, 33.33, 7.5);
    expect(calc.grossAmount).toBe(3333.11);
    expect(calc.retainageAmount).toBe(249.98);
    expect(calc.netAmount).toBe(3083.13);
  });
});
