import { calculateDisbursementCalendar } from "./disbursement-calendar";

const REF = new Date("2026-09-07T00:00:00.000Z"); // a Monday

describe("calculateDisbursementCalendar", () => {
  it("buckets a bill into the week containing its payment date", () => {
    const result = calculateDisbursementCalendar(
      [{ id: "b-1", billNumber: "B-1", supplierName: "Acme Supply", amount: 500, paymentDate: new Date("2026-09-10T00:00:00.000Z") }],
      4,
      REF,
    );
    expect(result.buckets[0].total).toBe(500);
    expect(result.buckets[0].bills).toHaveLength(1);
    expect(result.buckets[1].total).toBe(0);
  });

  it("collapses a past-due payment date into week 0 rather than dropping it", () => {
    const result = calculateDisbursementCalendar(
      [{ id: "b-1", billNumber: "B-1", supplierName: "Acme Supply", amount: 500, paymentDate: new Date("2026-08-01T00:00:00.000Z") }],
      4,
      REF,
    );
    expect(result.buckets[0].total).toBe(500);
  });

  it("surfaces a bill with no payment date at all as unscheduled, not in any bucket", () => {
    const result = calculateDisbursementCalendar(
      [{ id: "b-1", billNumber: "B-1", supplierName: "Acme Supply", amount: 500, paymentDate: null }],
      4,
      REF,
    );
    expect(result.buckets.every((b) => b.total === 0)).toBe(true);
    expect(result.unscheduledTotal).toBe(500);
    expect(result.unscheduledBills).toHaveLength(1);
  });

  it("drops a bill dated beyond the window entirely, without counting it as unscheduled", () => {
    const result = calculateDisbursementCalendar(
      [{ id: "b-1", billNumber: "B-1", supplierName: "Acme Supply", amount: 500, paymentDate: new Date("2027-01-01T00:00:00.000Z") }],
      4,
      REF,
    );
    expect(result.buckets.every((b) => b.total === 0)).toBe(true);
    expect(result.unscheduledTotal).toBe(0);
  });

  it("sums multiple bills landing in the same week", () => {
    const result = calculateDisbursementCalendar(
      [
        { id: "b-1", billNumber: "B-1", supplierName: "Acme Supply", amount: 500, paymentDate: new Date("2026-09-08T00:00:00.000Z") },
        { id: "b-2", billNumber: "B-2", supplierName: "Beta Materials", amount: 300, paymentDate: new Date("2026-09-09T00:00:00.000Z") },
      ],
      4,
      REF,
    );
    expect(result.buckets[0].total).toBe(800);
    expect(result.buckets[0].bills).toHaveLength(2);
  });
});
