import { calculateLongLeadRisk, type LongLeadRiskSourceItem } from "./long-lead-risk";

const BASE = new Date("2026-01-01T00:00:00Z").getTime();
const day = (n: number) => new Date(BASE + n * 24 * 60 * 60 * 1000);

const item = (overrides: Partial<LongLeadRiskSourceItem>): LongLeadRiskSourceItem => ({
  id: "item-1",
  description: "Elevator",
  status: "tracking",
  expectedDeliveryDate: null,
  actualDeliveryDate: null,
  requiredOnSiteDate: null,
  ...overrides,
});

describe("calculateLongLeadRisk", () => {
  it("marks an item unscheduled when either date is missing", () => {
    const [result] = calculateLongLeadRisk([item({ requiredOnSiteDate: day(10) })]);
    expect(result.risk).toBe("unscheduled");
    expect(result.slackDays).toBeNull();
  });

  it("marks an item critical when expected delivery is after the required date", () => {
    const [result] = calculateLongLeadRisk([item({ requiredOnSiteDate: day(5), expectedDeliveryDate: day(10) })]);
    expect(result.risk).toBe("critical");
    expect(result.slackDays).toBe(-5);
  });

  it("marks an item at_risk when slack is positive but within the threshold", () => {
    const [result] = calculateLongLeadRisk([item({ requiredOnSiteDate: day(20), expectedDeliveryDate: day(10) })]);
    expect(result.risk).toBe("at_risk");
    expect(result.slackDays).toBe(10);
  });

  it("marks an item on_track when slack comfortably exceeds the threshold", () => {
    const [result] = calculateLongLeadRisk([item({ requiredOnSiteDate: day(29), expectedDeliveryDate: day(1) })]);
    expect(result.risk).toBe("on_track");
  });

  it("marks a delivered item delivered_on_time when it arrived by the required date", () => {
    const [result] = calculateLongLeadRisk([item({ status: "delivered", requiredOnSiteDate: day(10), actualDeliveryDate: day(5) })]);
    expect(result.risk).toBe("delivered_on_time");
    expect(result.slackDays).toBe(5);
  });

  it("marks a delivered item delivered_late when it arrived after the required date", () => {
    const [result] = calculateLongLeadRisk([item({ status: "delivered", requiredOnSiteDate: day(5), actualDeliveryDate: day(10) })]);
    expect(result.risk).toBe("delivered_late");
    expect(result.slackDays).toBe(-5);
  });
});
