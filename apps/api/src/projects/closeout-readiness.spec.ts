import { computeCloseoutReadiness } from "./closeout-readiness";

describe("computeCloseoutReadiness", () => {
  it("is ready when documents are on file and nothing is open", () => {
    const result = computeCloseoutReadiness({ asBuiltCount: 1, omManualCount: 2, openPunchList: 0, openRfis: 0, openWarrantyClaims: 0 });
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("flags missing as-builts", () => {
    const result = computeCloseoutReadiness({ asBuiltCount: 0, omManualCount: 1, openPunchList: 0, openRfis: 0, openWarrantyClaims: 0 });
    expect(result.ready).toBe(false);
    expect(result.missing).toContain("as_built");
  });

  it("flags missing O&M manuals", () => {
    const result = computeCloseoutReadiness({ asBuiltCount: 1, omManualCount: 0, openPunchList: 0, openRfis: 0, openWarrantyClaims: 0 });
    expect(result.missing).toContain("om_manual");
  });

  it("flags open punch list, RFIs, and warranty claims independently", () => {
    const result = computeCloseoutReadiness({ asBuiltCount: 1, omManualCount: 1, openPunchList: 2, openRfis: 1, openWarrantyClaims: 3 });
    expect(result.missing).toEqual(["punch_list", "rfis", "warranty_claims"]);
  });
});
