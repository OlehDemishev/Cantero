import { checkApprenticeRatios } from "./apprentice-ratio";

describe("checkApprenticeRatios", () => {
  it("skips trades with no ratio configured", () => {
    const result = checkApprenticeRatios([{ trade: "Laborer", apprenticeRatio: null, isApprentice: true }]);
    expect(result).toEqual([]);
  });

  it("skips an unparseable ratio string", () => {
    const result = checkApprenticeRatios([{ trade: "Laborer", apprenticeRatio: "one per four", isApprentice: true }]);
    expect(result).toEqual([]);
  });

  it("is compliant when apprentice count is at the allowed maximum", () => {
    const workers = [
      { trade: "Electrician", apprenticeRatio: "1:4", isApprentice: false },
      { trade: "Electrician", apprenticeRatio: "1:4", isApprentice: false },
      { trade: "Electrician", apprenticeRatio: "1:4", isApprentice: false },
      { trade: "Electrician", apprenticeRatio: "1:4", isApprentice: false },
      { trade: "Electrician", apprenticeRatio: "1:4", isApprentice: true },
    ];
    const result = checkApprenticeRatios(workers);
    expect(result).toEqual([
      { trade: "Electrician", ratio: "1:4", journeymanCount: 4, apprenticeCount: 1, maxAllowedApprentices: 1, compliant: true },
    ]);
  });

  it("flags a violation when apprentice count exceeds the allowed maximum", () => {
    const workers = [
      { trade: "Electrician", apprenticeRatio: "1:4", isApprentice: false },
      { trade: "Electrician", apprenticeRatio: "1:4", isApprentice: true },
      { trade: "Electrician", apprenticeRatio: "1:4", isApprentice: true },
    ];
    const result = checkApprenticeRatios(workers);
    expect(result).toEqual([
      { trade: "Electrician", ratio: "1:4", journeymanCount: 1, apprenticeCount: 2, maxAllowedApprentices: 0, compliant: false },
    ]);
  });

  it("checks each trade independently", () => {
    const workers = [
      { trade: "Electrician", apprenticeRatio: "1:4", isApprentice: true },
      { trade: "Plumber", apprenticeRatio: "1:2", isApprentice: false },
      { trade: "Plumber", apprenticeRatio: "1:2", isApprentice: false },
      { trade: "Plumber", apprenticeRatio: "1:2", isApprentice: true },
    ];
    const result = checkApprenticeRatios(workers);
    expect(result).toEqual([
      { trade: "Electrician", ratio: "1:4", journeymanCount: 0, apprenticeCount: 1, maxAllowedApprentices: 0, compliant: false },
      { trade: "Plumber", ratio: "1:2", journeymanCount: 2, apprenticeCount: 1, maxAllowedApprentices: 1, compliant: true },
    ]);
  });
});
