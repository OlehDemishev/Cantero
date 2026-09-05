import { calculateTMTicketTotal } from "./tm-ticket-calc";

describe("calculateTMTicketTotal", () => {
  it("sums labor, equipment, and material cost", () => {
    expect(calculateTMTicketTotal(500, 200, 150)).toBe(850);
  });

  it("handles zero costs", () => {
    expect(calculateTMTicketTotal(0, 0, 0)).toBe(0);
  });

  it("rounds to two decimal places", () => {
    expect(calculateTMTicketTotal(100.111, 0, 0)).toBe(100.11);
  });
});
