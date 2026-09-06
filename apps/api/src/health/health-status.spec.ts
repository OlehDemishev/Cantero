import { computeHealthReport } from "./health-status";

describe("computeHealthReport", () => {
  it("reports ok when every check passed", () => {
    const report = computeHealthReport({ database: { ok: true }, redis: { ok: true } });
    expect(report.status).toBe("ok");
  });

  it("reports error when any single check failed", () => {
    const report = computeHealthReport({ database: { ok: true }, redis: { ok: false, error: "ECONNREFUSED" } });
    expect(report.status).toBe("error");
  });

  it("reports error when every check failed", () => {
    const report = computeHealthReport({ database: { ok: false, error: "timeout" }, redis: { ok: false, error: "timeout" } });
    expect(report.status).toBe("error");
  });

  it("passes the individual checks through unchanged", () => {
    const checks = { database: { ok: true }, redis: { ok: false, error: "ECONNREFUSED" } };
    expect(computeHealthReport(checks).checks).toEqual(checks);
  });
});
