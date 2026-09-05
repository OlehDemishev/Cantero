const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface DiversitySpendEntry {
  /** A subcontractor's certification categories — empty when uncertified. */
  categories: string[];
  amount: number;
}

export interface DiversitySpendResult {
  totalSpend: number;
  certifiedSpend: number;
  /** 0-100, null when there's no spend to measure against. */
  certifiedSharePercent: number | null;
  byCategory: { category: string; spend: number }[];
}

/**
 * Rolls up subcontractor spend by diversity certification for public-work compliance reporting
 * (e.g. "what share of this project's subcontractor spend went to certified MBE/WBE/DBE firms").
 * A sub certified in more than one category (e.g. both WBE and DBE) counts its full spend toward
 * each category it holds — this reports category coverage, not a mutually-exclusive split, since
 * a compliance officer needs to answer "how much went to WBE firms" and "how much went to DBE
 * firms" as separate, non-competing questions.
 */
export function calculateDiversitySpend(entries: DiversitySpendEntry[]): DiversitySpendResult {
  const totalSpend = round2(entries.reduce((sum, e) => sum + e.amount, 0));
  const certifiedSpend = round2(entries.filter((e) => e.categories.length > 0).reduce((sum, e) => sum + e.amount, 0));

  const byCategoryMap = new Map<string, number>();
  for (const entry of entries) {
    for (const category of entry.categories) {
      byCategoryMap.set(category, (byCategoryMap.get(category) ?? 0) + entry.amount);
    }
  }

  return {
    totalSpend,
    certifiedSpend,
    certifiedSharePercent: totalSpend > 0 ? round2((certifiedSpend / totalSpend) * 100) : null,
    byCategory: Array.from(byCategoryMap.entries())
      .map(([category, spend]) => ({ category, spend: round2(spend) }))
      .sort((a, b) => a.category.localeCompare(b.category)),
  };
}
