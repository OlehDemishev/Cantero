import type { BallInCourtParty } from "@cantero/shared";

export interface RfiAnalyticsSourceItem {
  id: string;
  number: string;
  status: "open" | "answered" | "closed";
  ballInCourtParty: BallInCourtParty;
  createdAt: Date;
  dueDate: Date | null;
  answeredAt: Date | null;
}

export interface RfiAnalytics {
  openCount: number;
  /** Across every RFI that has ever been answered, regardless of current status. */
  averageDaysToAnswer: number | null;
  oldestOpenRfi: { id: string; number: string; daysOpen: number } | null;
  /** Only counts RFIs still awaiting an answer — ball-in-court is stale once one exists. */
  ballInCourtBreakdown: { party: BallInCourtParty; count: number }[];
  /** % of due-dated, answered RFIs that were answered on or before their due date. Null when none had a due date. */
  slaCompliancePercent: number | null;
  answeredWithDueDateCount: number;
  answeredOnTimeCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Turnaround-time analytics for a project's RFI log — distinct from SlaEscalationService, which
 * only flags individual overdue RFIs. This aggregates across the whole log: how fast RFIs
 * actually get answered on average, which open one has waited longest, whose court the ball is
 * in right now, and what fraction of due-dated RFIs got answered on time. Closed-without-answer
 * RFIs are excluded from timing stats (there's no answer to time), but still count toward
 * openCount as not-open.
 */
export function calculateRfiAnalytics(items: RfiAnalyticsSourceItem[], now: Date): RfiAnalytics {
  const openItems = items.filter((i) => i.status === "open");
  const answeredItems = items.filter((i) => i.answeredAt !== null);

  const daysToAnswer = answeredItems.map((i) => (i.answeredAt!.getTime() - i.createdAt.getTime()) / DAY_MS);
  const averageDaysToAnswer = daysToAnswer.length > 0 ? round1(daysToAnswer.reduce((sum, d) => sum + d, 0) / daysToAnswer.length) : null;

  const oldestOpen = openItems.reduce<RfiAnalyticsSourceItem | null>((oldest, item) => {
    if (!oldest || item.createdAt.getTime() < oldest.createdAt.getTime()) return item;
    return oldest;
  }, null);
  const oldestOpenRfi = oldestOpen
    ? { id: oldestOpen.id, number: oldestOpen.number, daysOpen: round1((now.getTime() - oldestOpen.createdAt.getTime()) / DAY_MS) }
    : null;

  const ballInCourtCounts = new Map<BallInCourtParty, number>();
  for (const item of openItems) ballInCourtCounts.set(item.ballInCourtParty, (ballInCourtCounts.get(item.ballInCourtParty) ?? 0) + 1);
  const ballInCourtBreakdown = Array.from(ballInCourtCounts.entries())
    .map(([party, count]) => ({ party, count }))
    .sort((a, b) => b.count - a.count);

  const answeredWithDueDate = answeredItems.filter((i) => i.dueDate !== null);
  const answeredOnTime = answeredWithDueDate.filter((i) => i.answeredAt!.getTime() <= i.dueDate!.getTime());
  const slaCompliancePercent = answeredWithDueDate.length > 0 ? round1((answeredOnTime.length / answeredWithDueDate.length) * 100) : null;

  return {
    openCount: openItems.length,
    averageDaysToAnswer,
    oldestOpenRfi,
    ballInCourtBreakdown,
    slaCompliancePercent,
    answeredWithDueDateCount: answeredWithDueDate.length,
    answeredOnTimeCount: answeredOnTime.length,
  };
}
