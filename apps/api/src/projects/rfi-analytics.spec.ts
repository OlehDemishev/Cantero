import { calculateRfiAnalytics, type RfiAnalyticsSourceItem } from "./rfi-analytics";

const NOW = new Date("2026-09-10T00:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

const item = (overrides: Partial<RfiAnalyticsSourceItem>): RfiAnalyticsSourceItem => ({
  id: "rfi-1",
  number: "RFI-001",
  status: "open",
  ballInCourtParty: "internal",
  createdAt: days(5),
  dueDate: null,
  answeredAt: null,
  ...overrides,
});

describe("calculateRfiAnalytics", () => {
  it("computes average days-to-answer across answered RFIs", () => {
    const result = calculateRfiAnalytics(
      [
        item({ id: "1", status: "answered", createdAt: days(10), answeredAt: days(8) }),
        item({ id: "2", status: "answered", createdAt: days(10), answeredAt: days(4) }),
      ],
      NOW,
    );
    expect(result.averageDaysToAnswer).toBe(4);
  });

  it("returns null average when nothing has been answered", () => {
    const result = calculateRfiAnalytics([item({ status: "open" })], NOW);
    expect(result.averageDaysToAnswer).toBeNull();
  });

  it("finds the oldest open RFI by createdAt, ignoring answered/closed ones", () => {
    const result = calculateRfiAnalytics(
      [
        item({ id: "1", status: "open", createdAt: days(3) }),
        item({ id: "2", status: "open", createdAt: days(20) }),
        item({ id: "3", status: "closed", createdAt: days(100) }),
      ],
      NOW,
    );
    expect(result.oldestOpenRfi).toEqual({ id: "2", number: "RFI-001", daysOpen: 20 });
  });

  it("breaks down open RFIs by ball-in-court party, excluding answered/closed", () => {
    const result = calculateRfiAnalytics(
      [
        item({ id: "1", status: "open", ballInCourtParty: "client" }),
        item({ id: "2", status: "open", ballInCourtParty: "client" }),
        item({ id: "3", status: "open", ballInCourtParty: "internal" }),
        item({ id: "4", status: "answered", ballInCourtParty: "subcontractor" }),
      ],
      NOW,
    );
    expect(result.ballInCourtBreakdown).toEqual([
      { party: "client", count: 2 },
      { party: "internal", count: 1 },
    ]);
  });

  it("computes SLA compliance among answered RFIs that had a due date", () => {
    const result = calculateRfiAnalytics(
      [
        item({ id: "1", status: "answered", createdAt: days(10), dueDate: days(5), answeredAt: days(6) }),
        item({ id: "2", status: "answered", createdAt: days(10), dueDate: days(5), answeredAt: days(3) }),
        item({ id: "3", status: "answered", createdAt: days(10), dueDate: null, answeredAt: days(3) }),
      ],
      NOW,
    );
    expect(result.answeredWithDueDateCount).toBe(2);
    expect(result.answeredOnTimeCount).toBe(1);
    expect(result.slaCompliancePercent).toBe(50);
  });

  it("returns null SLA compliance when no answered RFI had a due date", () => {
    const result = calculateRfiAnalytics([item({ status: "answered", answeredAt: days(1), dueDate: null })], NOW);
    expect(result.slaCompliancePercent).toBeNull();
  });
});
