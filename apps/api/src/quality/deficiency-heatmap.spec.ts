import { calculateDeficiencyHeatmap } from "./deficiency-heatmap";

describe("calculateDeficiencyHeatmap", () => {
  it("buckets by location and counts each severity independently", () => {
    const result = calculateDeficiencyHeatmap([
      { location: "3rd floor", severity: "major" },
      { location: "3rd floor", severity: "critical" },
      { location: "3rd floor", severity: "major" },
      { location: "2nd floor", severity: "minor" },
    ]);

    expect(result[0]).toEqual({ location: "3rd floor", total: 3, minor: 0, major: 2, critical: 1 });
    expect(result[1]).toEqual({ location: "2nd floor", total: 1, minor: 1, major: 0, critical: 0 });
  });

  it("sorts by total descending, most-affected zone first", () => {
    const result = calculateDeficiencyHeatmap([
      { location: "A", severity: "minor" },
      { location: "B", severity: "minor" },
      { location: "B", severity: "minor" },
    ]);
    expect(result.map((r) => r.location)).toEqual(["B", "A"]);
  });

  it("groups a null or blank location under a shared Unspecified bucket", () => {
    const result = calculateDeficiencyHeatmap([
      { location: null, severity: "minor" },
      { location: "  ", severity: "major" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].location).toBe("Unspecified");
    expect(result[0].total).toBe(2);
  });
});
