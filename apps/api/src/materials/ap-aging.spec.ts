import { calculateApAging } from "./ap-aging";

const asOf = new Date("2026-09-02T00:00:00.000Z");
const daysAgo = (days: number) => new Date(asOf.getTime() - days * 24 * 60 * 60 * 1000);

describe("calculateApAging()", () => {
  it("buckets a bill with no due date yet as current, not overdue", () => {
    const report = calculateApAging([{ id: "b1", billNumber: "B1", supplierName: "Acme", amount: 100, dueDate: null }], asOf);
    expect(report.bills[0].bucket).toBe("current");
    expect(report.bills[0].daysPastDue).toBe(0);
  });

  it("buckets a bill whose due date hasn't arrived yet as current", () => {
    const report = calculateApAging([{ id: "b1", billNumber: "B1", supplierName: "Acme", amount: 100, dueDate: daysAgo(-10) }], asOf);
    expect(report.bills[0].bucket).toBe("current");
  });

  it("buckets a bill 15 days overdue as days1to30", () => {
    const report = calculateApAging([{ id: "b1", billNumber: "B1", supplierName: "Acme", amount: 100, dueDate: daysAgo(15) }], asOf);
    expect(report.bills[0].bucket).toBe("days1to30");
    expect(report.bills[0].daysPastDue).toBe(15);
  });

  it("buckets a bill 45 days overdue as days31to60", () => {
    const report = calculateApAging([{ id: "b1", billNumber: "B1", supplierName: "Acme", amount: 100, dueDate: daysAgo(45) }], asOf);
    expect(report.bills[0].bucket).toBe("days31to60");
  });

  it("buckets a bill 200 days overdue as over90", () => {
    const report = calculateApAging([{ id: "b1", billNumber: "B1", supplierName: "Acme", amount: 100, dueDate: daysAgo(200) }], asOf);
    expect(report.bills[0].bucket).toBe("over90");
  });

  it("sums totals per bucket and a grand total across all bills", () => {
    const report = calculateApAging(
      [
        { id: "b1", billNumber: "B1", supplierName: "Acme", amount: 100, dueDate: daysAgo(5) },
        { id: "b2", billNumber: "B2", supplierName: "Acme", amount: 50, dueDate: daysAgo(5) },
        { id: "b3", billNumber: "B3", supplierName: "Beta", amount: 200, dueDate: daysAgo(95) },
      ],
      asOf,
    );
    expect(report.totalsByBucket.days1to30).toBe(150);
    expect(report.totalsByBucket.over90).toBe(200);
    expect(report.grandTotal).toBe(350);
  });
});
