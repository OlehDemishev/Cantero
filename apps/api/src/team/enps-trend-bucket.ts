/** Same promoter/detractor thresholds as EnpsSurveysService.trend() — kept in sync manually since this is the one other place the eNPS formula is computed. */
const PROMOTER_MIN_SCORE = 9;
const DETRACTOR_MAX_SCORE = 6;

export interface EnpsResponseRow {
  score: number;
  respondedAt: Date;
}
export interface EnpsMonthBucket {
  month: string;
  enpsScore: number | null;
  responseCount: number;
}

/**
 * Buckets eNPS responses into calendar months for a trend chart, deliberately never returning
 * anything below a monthly aggregate (no raw per-respondent score/date pair) — the anonymity
 * guarantee EnpsSurveysService.trend() already documents applies here too. A month with zero
 * responses reports enpsScore: null rather than 0, so a chart can tell "no data" from "score of
 * exactly zero" (an even split of promoters and detractors).
 */
export function bucketEnpsTrendByMonth(responses: EnpsResponseRow[], months: number, now: Date): EnpsMonthBucket[] {
  const buckets = new Map<string, EnpsResponseRow[]>();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, []);
  }
  for (const r of responses) {
    const key = `${r.respondedAt.getFullYear()}-${String(r.respondedAt.getMonth() + 1).padStart(2, "0")}`;
    buckets.get(key)?.push(r);
  }

  return [...buckets.entries()].map(([month, rows]) => {
    const responseCount = rows.length;
    if (responseCount === 0) return { month, enpsScore: null, responseCount: 0 };
    const promoters = rows.filter((r) => r.score >= PROMOTER_MIN_SCORE).length;
    const detractors = rows.filter((r) => r.score <= DETRACTOR_MAX_SCORE).length;
    return { month, enpsScore: Math.round(((promoters - detractors) / responseCount) * 100), responseCount };
  });
}
