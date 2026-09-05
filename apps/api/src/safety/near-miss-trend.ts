export interface IncidentForNearMissTrend {
  occurredAt: Date;
  isNearMiss: boolean;
  oshaRecordable: boolean;
}

export interface MonthlyNearMissPoint {
  month: number;
  nearMissCount: number;
  recordableCount: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Near-miss-to-recordable ratio is a leading-indicator health check, not a hazard count: per
 * Heinrich's triangle, a *higher* ratio (many near-misses reported relative to actual recordable
 * injuries) signals a reporting culture that catches problems before someone gets hurt, while a
 * ratio that's low or falling over time can mean under-reporting rather than fewer close calls.
 * Returns null when there are zero recordable cases — "undefined," not "infinitely good," since
 * a handful of near-misses against zero incidents in a short window isn't a reliable signal yet.
 */
export function calculateNearMissRatio(nearMissCount: number, recordableCount: number): number | null {
  return recordableCount > 0 ? round2(nearMissCount / recordableCount) : null;
}

export function buildMonthlyNearMissTrend(incidents: IncidentForNearMissTrend[]): MonthlyNearMissPoint[] {
  return Array.from({ length: 12 }, (_, month) => {
    const monthIncidents = incidents.filter((i) => i.occurredAt.getUTCMonth() === month);
    return {
      month: month + 1,
      nearMissCount: monthIncidents.filter((i) => i.isNearMiss).length,
      recordableCount: monthIncidents.filter((i) => i.oshaRecordable).length,
    };
  });
}
