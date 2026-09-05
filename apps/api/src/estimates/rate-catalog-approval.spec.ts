import { rateChangeRequiresApproval } from "./rate-catalog-approval";

describe("rateChangeRequiresApproval", () => {
  it("never requires approval when thresholdPercent is null (gating off)", () => {
    expect(rateChangeRequiresApproval({ currentLaborHoursPerUnit: 1, newLaborHoursPerUnit: 10, thresholdPercent: null })).toBe(false);
  });

  it("never requires approval when laborHoursPerUnit isn't part of the edit", () => {
    expect(rateChangeRequiresApproval({ currentLaborHoursPerUnit: 1, newLaborHoursPerUnit: undefined, thresholdPercent: 10 })).toBe(false);
  });

  it("does not require approval for a swing within the threshold", () => {
    // 1.0 -> 1.05 is a 5% change, threshold is 10%
    expect(rateChangeRequiresApproval({ currentLaborHoursPerUnit: 1, newLaborHoursPerUnit: 1.05, thresholdPercent: 10 })).toBe(false);
  });

  it("requires approval for a swing exceeding the threshold, in either direction", () => {
    expect(rateChangeRequiresApproval({ currentLaborHoursPerUnit: 1, newLaborHoursPerUnit: 1.5, thresholdPercent: 10 })).toBe(true);
    expect(rateChangeRequiresApproval({ currentLaborHoursPerUnit: 1, newLaborHoursPerUnit: 0.5, thresholdPercent: 10 })).toBe(true);
  });

  it("treats going from zero to any nonzero value as requiring approval", () => {
    expect(rateChangeRequiresApproval({ currentLaborHoursPerUnit: 0, newLaborHoursPerUnit: 1, thresholdPercent: 10 })).toBe(true);
  });

  it("does not require approval when the value is unchanged", () => {
    expect(rateChangeRequiresApproval({ currentLaborHoursPerUnit: 0, newLaborHoursPerUnit: 0, thresholdPercent: 10 })).toBe(false);
    expect(rateChangeRequiresApproval({ currentLaborHoursPerUnit: 2, newLaborHoursPerUnit: 2, thresholdPercent: 10 })).toBe(false);
  });
});
