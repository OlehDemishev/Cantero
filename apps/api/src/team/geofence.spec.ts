import { checkGeofence, distanceMeters } from "./geofence";

describe("distanceMeters", () => {
  it("returns 0 for the same point", () => {
    expect(distanceMeters(52.52, 13.405, 52.52, 13.405)).toBe(0);
  });

  it("computes a known real-world distance within a small tolerance", () => {
    // Berlin (52.5200, 13.4050) to Frankfurt (50.1109, 8.6821) is ~424km.
    const d = distanceMeters(52.52, 13.405, 50.1109, 8.6821);
    expect(d).toBeGreaterThan(420_000);
    expect(d).toBeLessThan(430_000);
  });
});

describe("checkGeofence", () => {
  it("flags a point inside the radius as within the geofence", () => {
    const result = checkGeofence(52.5201, 13.4051, 52.52, 13.405, 100);
    expect(result.withinGeofence).toBe(true);
    expect(result.distanceMeters).toBeLessThan(100);
  });

  it("flags a point far outside the radius as not within the geofence", () => {
    const result = checkGeofence(50.1109, 8.6821, 52.52, 13.405, 500);
    expect(result.withinGeofence).toBe(false);
    expect(result.distanceMeters).toBeGreaterThan(500);
  });

  it("treats exactly the radius distance as within the geofence", () => {
    const d = distanceMeters(52.52, 13.405, 52.521, 13.405);
    const result = checkGeofence(52.521, 13.405, 52.52, 13.405, Math.ceil(d));
    expect(result.withinGeofence).toBe(true);
  });
});
