import { calculateChangeOrderProfitability } from "./change-order-profitability";

describe("calculateChangeOrderProfitability", () => {
  it("computes cost/revenue/margin for the base contract and each change order independently", () => {
    const result = calculateChangeOrderProfitability(
      { materialsCostTotal: 6000, laborCostTotal: 4000, grandTotal: 12000 },
      [{ id: "co-1", number: 1, title: "Add deck", materialsCostTotal: 1000, laborCostTotal: 500, grandTotal: 2000 }],
    );

    expect(result.baseContract).toEqual({ cost: 10000, revenue: 12000, margin: 2000, marginPercent: 16.67 });
    expect(result.changeOrders[0]).toMatchObject({ id: "co-1", number: 1, title: "Add deck", cost: 1500, revenue: 2000, margin: 500, marginPercent: 25 });
  });

  it("shows a change order earning a worse margin than the base contract as a lower marginPercent", () => {
    const result = calculateChangeOrderProfitability(
      { materialsCostTotal: 5000, laborCostTotal: 5000, grandTotal: 12000 }, // ~16.7% margin
      [{ id: "co-1", number: 1, title: "Rush job", materialsCostTotal: 900, laborCostTotal: 900, grandTotal: 1000 }], // -80% margin
    );
    expect(result.baseContract.marginPercent).toBeGreaterThan(0);
    expect(result.changeOrders[0].marginPercent).toBeLessThan(0);
  });

  it("sums change orders and combines them with the base contract", () => {
    const result = calculateChangeOrderProfitability(
      { materialsCostTotal: 6000, laborCostTotal: 4000, grandTotal: 12000 },
      [
        { id: "co-1", number: 1, title: "A", materialsCostTotal: 1000, laborCostTotal: 500, grandTotal: 2000 },
        { id: "co-2", number: 2, title: "B", materialsCostTotal: 500, laborCostTotal: 500, grandTotal: 1500 },
      ],
    );

    expect(result.changeOrdersTotal).toEqual({ cost: 2500, revenue: 3500, margin: 1000, marginPercent: 28.57 });
    expect(result.combined).toEqual({ cost: 12500, revenue: 15500, margin: 3000, marginPercent: 19.35 });
  });

  it("returns a null marginPercent when revenue is zero, for both the base contract and an empty change-order list", () => {
    const result = calculateChangeOrderProfitability({ materialsCostTotal: 0, laborCostTotal: 0, grandTotal: 0 }, []);
    expect(result.baseContract.marginPercent).toBeNull();
    expect(result.changeOrdersTotal.marginPercent).toBeNull();
    expect(result.combined.marginPercent).toBeNull();
    expect(result.changeOrders).toEqual([]);
  });
});
