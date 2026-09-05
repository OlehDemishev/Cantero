/**
 * Phase keyword → percent-complete heuristic used by ProgressTrackingService to turn a project's
 * tagged jobsite photos into a rough completion estimate. This is pattern-matching on human-
 * entered tags, not computer vision — matchedKeywords in the result always records what actually
 * drove the number. Keys are matched case-insensitively as substrings of a photo's tags, and the
 * *most advanced* phase found wins (construction phases are treated as monotonic: once a
 * "drywall" photo exists, an earlier "framing" tag shouldn't pull the estimate back down).
 */
export const PROGRESS_PHASE_KEYWORDS: readonly { keyword: string; percent: number }[] = [
  { keyword: "mobilization", percent: 2 },
  { keyword: "sitework", percent: 5 },
  { keyword: "excavation", percent: 8 },
  { keyword: "foundation", percent: 15 },
  { keyword: "slab", percent: 20 },
  { keyword: "framing", percent: 30 },
  { keyword: "roofing", percent: 38 },
  { keyword: "rough-in", percent: 45 },
  { keyword: "rough in", percent: 45 },
  { keyword: "mep", percent: 45 },
  { keyword: "insulation", percent: 52 },
  { keyword: "drywall", percent: 60 },
  { keyword: "paint", percent: 68 },
  { keyword: "flooring", percent: 75 },
  { keyword: "trim", percent: 78 },
  { keyword: "fixtures", percent: 82 },
  { keyword: "finishes", percent: 85 },
  { keyword: "punch", percent: 95 },
  { keyword: "closeout", percent: 98 },
  { keyword: "complete", percent: 100 },
];

/** Percentage-point gap between the photo-based estimate and the last progress-billing draw's
 * percentComplete above which a discrepancy is worth a human's attention. */
export const PROGRESS_VARIANCE_THRESHOLD_PERCENT = 15;

export interface ProgressEstimateComputation {
  estimatedPercentComplete: number;
  matchedKeywords: string[];
  photoCount: number;
}
