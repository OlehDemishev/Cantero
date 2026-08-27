import { polygonAreaPixels, polylineLengthPixels, scaleToReal } from "./takeoff-geometry";

describe("polylineLengthPixels", () => {
  it("computes the length of a single straight segment", () => {
    expect(polylineLengthPixels([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBe(5);
  });

  it("sums a multi-segment polyline", () => {
    const length = polylineLengthPixels([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 8 }]);
    expect(length).toBe(9);
  });

  it("returns 0 for a single point", () => {
    expect(polylineLengthPixels([{ x: 5, y: 5 }])).toBe(0);
  });
});

describe("polygonAreaPixels", () => {
  it("computes the area of a simple square", () => {
    const area = polygonAreaPixels([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
    expect(area).toBe(100);
  });

  it("is independent of winding direction", () => {
    const clockwise = polygonAreaPixels([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
    const counterClockwise = polygonAreaPixels([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }]);
    expect(clockwise).toBe(counterClockwise);
  });

  it("returns 0 for fewer than 3 points", () => {
    expect(polygonAreaPixels([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });

  it("computes a triangle's area", () => {
    const area = polygonAreaPixels([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }]);
    expect(area).toBe(6);
  });
});

describe("scaleToReal", () => {
  it("scales a length linearly with the pixel-to-real ratio", () => {
    // 100px on screen = 5 real meters, so a 200px measurement is 10 meters.
    expect(scaleToReal(200, 100, 5, "length")).toBe(10);
  });

  it("scales an area with the square of the ratio", () => {
    // Same 100px : 5m calibration — a 10000px² region is (5/100)^2 * 10000 = 25 m².
    expect(scaleToReal(10000, 100, 5, "area")).toBe(25);
  });

  it("throws when the takeoff has no calibration", () => {
    expect(() => scaleToReal(200, 0, 5, "length")).toThrow();
  });
});
