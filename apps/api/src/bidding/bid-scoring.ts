export interface CriterionWeight {
  criterionId: string;
  weight: number;
}
export interface BidScoreEntry {
  criterionId: string;
  score: number;
}

/** Weighted average (1-5 scale) over only the criteria this bid has actually been scored
 * against — an unscored criterion is left out of both the numerator and the weight total,
 * rather than counted as a 0, so a partially-scored bid isn't unfairly dragged down while
 * scoring is still in progress. Returns null when nothing has been scored yet. */
export function weightedBidScore(scores: BidScoreEntry[], criteria: CriterionWeight[]): number | null {
  const weightById = new Map(criteria.map((c) => [c.criterionId, c.weight]));

  let weightedSum = 0;
  let totalWeight = 0;
  for (const s of scores) {
    const weight = weightById.get(s.criterionId);
    if (weight === undefined) continue;
    weightedSum += s.score * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return null;
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}
