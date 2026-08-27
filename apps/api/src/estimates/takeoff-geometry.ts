export interface Point {
  x: number;
  y: number;
}

/** Sum of segment lengths through consecutive points, in pixel space — a straight 2-point line
 * or a multi-segment polyline (e.g. tracing a run of baseboard around several wall corners). */
export function polylineLengthPixels(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

/** Shoelace formula — the standard way to get a simple polygon's area from its vertices,
 * independent of winding direction (hence the abs()). Pixel space, not yet scaled to real units. */
export function polygonAreaPixels(points: Point[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Converts a pixel-space length or area into real-world units using the takeoff's calibration
 * (one reference line of known real-world length, measured in pixels). A length scales linearly
 * with the pixel→real ratio; an area scales with its square, since area is length².
 */
export function scaleToReal(pixelValue: number, scalePixelLength: number, scaleRealLength: number, dimension: "length" | "area"): number {
  if (scalePixelLength <= 0) throw new Error("Takeoff is not calibrated — scalePixelLength must be positive");
  const ratio = scaleRealLength / scalePixelLength;
  return dimension === "length" ? pixelValue * ratio : pixelValue * ratio * ratio;
}
