import type { ApprenticeRatioViolation } from "@cantero/shared";

export interface WorkerHoursForRatioCheck {
  trade: string;
  apprenticeRatio: string | null;
  isApprentice: boolean;
}

/** Parses an "A:J" style ratio (e.g. "1:4" = 1 apprentice allowed per 4 journeymen — the standard
 * way these ratios are quoted in a CBA/prevailing-wage determination) into the two numbers.
 * Returns null for anything that doesn't parse — an unparseable or missing ratio means
 * "unenforced" rather than a hard failure, since the field is free text (see
 * WageClassification.apprenticeRatio's schema comment). */
function parseRatio(ratio: string): { apprentices: number; journeymen: number } | null {
  const match = ratio.trim().match(/^(\d+)\s*:\s*(\d+)$/);
  if (!match) return null;
  const apprentices = Number(match[1]);
  const journeymen = Number(match[2]);
  if (journeymen <= 0 || apprentices <= 0) return null;
  return { apprentices, journeymen };
}

/**
 * Groups the week's workers by trade and checks each trade's actual apprentice:journeyman
 * headcount against its WageClassification.apprenticeRatio. Ratio is read as "N apprentices
 * allowed per D journeymen" (e.g. "1:4"), so maxAllowedApprentices = floor(journeymanCount * N / D).
 * Trades with no ratio configured, or an unparseable one, are skipped (not flagged) — see
 * parseRatio's note on why "unenforced" is the safe default for free text.
 */
export function checkApprenticeRatios(workers: WorkerHoursForRatioCheck[]): ApprenticeRatioViolation[] {
  const byTrade = new Map<string, { ratio: string; journeymanCount: number; apprenticeCount: number }>();

  for (const w of workers) {
    if (!w.apprenticeRatio) continue;
    const bucket = byTrade.get(w.trade) ?? { ratio: w.apprenticeRatio, journeymanCount: 0, apprenticeCount: 0 };
    if (w.isApprentice) bucket.apprenticeCount += 1;
    else bucket.journeymanCount += 1;
    byTrade.set(w.trade, bucket);
  }

  const violations: ApprenticeRatioViolation[] = [];
  for (const [trade, bucket] of byTrade) {
    const parsed = parseRatio(bucket.ratio);
    if (!parsed) continue;
    const maxAllowedApprentices = Math.floor((bucket.journeymanCount * parsed.apprentices) / parsed.journeymen);
    violations.push({
      trade,
      ratio: bucket.ratio,
      journeymanCount: bucket.journeymanCount,
      apprenticeCount: bucket.apprenticeCount,
      maxAllowedApprentices,
      compliant: bucket.apprenticeCount <= maxAllowedApprentices,
    });
  }
  return violations;
}
