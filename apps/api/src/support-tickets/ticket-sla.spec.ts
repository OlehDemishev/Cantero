import { calculateSlaBreachStatus, calculateSlaDeadlines } from "./ticket-sla";

describe("calculateSlaDeadlines()", () => {
  it("returns null deadlines when no policy is configured", () => {
    const result = calculateSlaDeadlines(null, new Date("2026-01-01T00:00:00.000Z"));
    expect(result.slaResponseDueAt).toBeNull();
    expect(result.slaResolutionDueAt).toBeNull();
  });

  it("stamps response/resolution deadlines from the policy's minutes", () => {
    const result = calculateSlaDeadlines({ responseMinutes: 60, resolutionMinutes: 1440 }, new Date("2026-01-01T00:00:00.000Z"));
    expect(result.slaResponseDueAt).toEqual(new Date("2026-01-01T01:00:00.000Z"));
    expect(result.slaResolutionDueAt).toEqual(new Date("2026-01-02T00:00:00.000Z"));
  });
});

describe("calculateSlaBreachStatus()", () => {
  const now = new Date("2026-01-02T00:00:00.000Z");

  it("flags a response breach when unanswered past the response deadline", () => {
    const result = calculateSlaBreachStatus(
      { slaResponseDueAt: new Date("2026-01-01T00:00:00.000Z"), slaResolutionDueAt: null, firstRespondedAt: null, status: "open" },
      now,
    );
    expect(result.responseBreached).toBe(true);
  });

  it("does not flag a response breach once the ticket has been answered", () => {
    const result = calculateSlaBreachStatus(
      {
        slaResponseDueAt: new Date("2026-01-01T00:00:00.000Z"),
        slaResolutionDueAt: null,
        firstRespondedAt: new Date("2026-01-01T12:00:00.000Z"),
        status: "open",
      },
      now,
    );
    expect(result.responseBreached).toBe(false);
  });

  it("flags a resolution breach when still open past the resolution deadline", () => {
    const result = calculateSlaBreachStatus(
      { slaResponseDueAt: null, slaResolutionDueAt: new Date("2026-01-01T00:00:00.000Z"), firstRespondedAt: null, status: "in_progress" },
      now,
    );
    expect(result.resolutionBreached).toBe(true);
  });

  it("does not flag a resolution breach once the ticket is resolved or closed", () => {
    const result = calculateSlaBreachStatus(
      { slaResponseDueAt: null, slaResolutionDueAt: new Date("2026-01-01T00:00:00.000Z"), firstRespondedAt: null, status: "resolved" },
      now,
    );
    expect(result.resolutionBreached).toBe(false);
  });

  it("reports no breach when both deadlines are still in the future", () => {
    const result = calculateSlaBreachStatus(
      {
        slaResponseDueAt: new Date("2026-01-03T00:00:00.000Z"),
        slaResolutionDueAt: new Date("2026-01-04T00:00:00.000Z"),
        firstRespondedAt: null,
        status: "open",
      },
      now,
    );
    expect(result.responseBreached).toBe(false);
    expect(result.resolutionBreached).toBe(false);
  });
});
