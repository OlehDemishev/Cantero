export interface CostImpactSourceItem {
  type: "rfi" | "punch_list";
  id: string;
  label: string;
  estimatedCostImpact: number | null;
  /** The linked change order's own priced total, when one has been raised — null means unconfirmed. */
  confirmedAmount: number | null;
}
export interface CostImpactRow extends CostImpactSourceItem {
  /** confirmedAmount when linked, else estimatedCostImpact — whichever is the best figure on hand. */
  bestAmount: number | null;
}
export interface CostImpactSummary {
  rows: CostImpactRow[];
  totalEstimated: number;
  totalConfirmed: number;
  unconfirmedCount: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Rolls up a project's RFIs and punch list items that carry a cost impact into one report,
 * distinguishing an estimate (a guess entered when the item was raised) from a confirmation (a
 * real change order actually priced and linked to it) — see RfiService/PunchListService's
 * linkChangeOrder(). Items with neither an estimate nor a confirmed link are excluded entirely,
 * since "no cost impact" isn't this report's concern.
 */
export function calculateCostImpactSummary(items: CostImpactSourceItem[]): CostImpactSummary {
  const relevant = items.filter((i) => i.estimatedCostImpact !== null || i.confirmedAmount !== null);

  const rows: CostImpactRow[] = relevant.map((i) => ({
    ...i,
    bestAmount: i.confirmedAmount ?? i.estimatedCostImpact,
  }));

  const totalEstimated = round2(relevant.reduce((sum, i) => sum + (i.estimatedCostImpact ?? 0), 0));
  const totalConfirmed = round2(relevant.reduce((sum, i) => sum + (i.confirmedAmount ?? 0), 0));
  const unconfirmedCount = relevant.filter((i) => i.confirmedAmount === null).length;

  return { rows, totalEstimated, totalConfirmed, unconfirmedCount };
}
