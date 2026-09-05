import { PROGRESS_PHASE_KEYWORDS, type ProgressEstimateComputation } from "@cantero/shared";

export interface PhotoForProgressEstimate {
  tags: string[];
}

/**
 * Scans every photo's tags for a substring match against PROGRESS_PHASE_KEYWORDS and returns the
 * single most-advanced matching phase's percent — construction phases are treated as monotonic
 * (see the shared dictionary's comment), so the highest percent found anywhere wins rather than
 * an average. matchedKeywords records only the keyword(s) that actually produced that top
 * percentage, so a reviewer can see exactly what tag drove the number.
 */
export function estimateProgressFromPhotos(photos: PhotoForProgressEstimate[]): ProgressEstimateComputation {
  let bestPercent = 0;
  let matchedKeywords: string[] = [];

  for (const photo of photos) {
    for (const tag of photo.tags) {
      const normalized = tag.toLowerCase();
      for (const phase of PROGRESS_PHASE_KEYWORDS) {
        if (!normalized.includes(phase.keyword)) continue;
        if (phase.percent > bestPercent) {
          bestPercent = phase.percent;
          matchedKeywords = [phase.keyword];
        } else if (phase.percent === bestPercent && !matchedKeywords.includes(phase.keyword)) {
          matchedKeywords.push(phase.keyword);
        }
      }
    }
  }

  return { estimatedPercentComplete: bestPercent, matchedKeywords, photoCount: photos.length };
}
