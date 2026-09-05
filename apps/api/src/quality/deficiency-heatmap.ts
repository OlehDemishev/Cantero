export interface DeficiencyForHeatmap {
  location: string | null;
  severity: "minor" | "major" | "critical";
}

export interface HeatmapBucket {
  location: string;
  total: number;
  minor: number;
  major: number;
  critical: number;
}

const UNSPECIFIED_LOCATION = "Unspecified";

/** Clusters deficiencies by their free-text location, most-affected zone first — the "where do
 * defects keep happening" report, feeding a heat-map view keyed by whatever zone/floor naming
 * the project uses. Deficiencies with no location are grouped under one shared bucket rather
 * than dropped, so untracked-location work still shows up in the total. */
export function calculateDeficiencyHeatmap(deficiencies: DeficiencyForHeatmap[]): HeatmapBucket[] {
  const buckets = new Map<string, HeatmapBucket>();
  for (const d of deficiencies) {
    const key = d.location?.trim() || UNSPECIFIED_LOCATION;
    if (!buckets.has(key)) buckets.set(key, { location: key, total: 0, minor: 0, major: 0, critical: 0 });
    const bucket = buckets.get(key)!;
    bucket.total += 1;
    bucket[d.severity] += 1;
  }
  return Array.from(buckets.values()).sort((a, b) => b.total - a.total);
}
