import { computeAllowanceStatus } from "./allowance-status";

describe("computeAllowanceStatus", () => {
  it("is active when spent is under budget", () => {
    expect(computeAllowanceStatus(5000, 3000, "active")).toBe("active");
  });

  it("is active when spent exactly equals budget", () => {
    expect(computeAllowanceStatus(5000, 5000, "active")).toBe("active");
  });

  it("is exceeded when spent goes over budget", () => {
    expect(computeAllowanceStatus(5000, 5001, "active")).toBe("exceeded");
  });

  it("drops back to active if a charge is removed and spent falls back under budget", () => {
    expect(computeAllowanceStatus(5000, 4000, "exceeded")).toBe("active");
  });

  it("stays closed even if spent is now under budget", () => {
    expect(computeAllowanceStatus(5000, 1000, "closed")).toBe("closed");
  });

  it("stays closed even if spent exceeds budget", () => {
    expect(computeAllowanceStatus(5000, 9000, "closed")).toBe("closed");
  });
});
