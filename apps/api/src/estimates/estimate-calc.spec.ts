import { calculateEstimate, type MaterialPrice, type RateItemForCalc } from "./estimate-calc";

describe("calculateEstimate", () => {
  const tileRateItem: RateItemForCalc = {
    id: "rate-tile",
    laborHoursPerUnit: 0.5,
    materials: [
      { materialCatalogItemId: "mat-tile", quantityPerUnit: 1, wasteFactorPercent: 5 },
      { materialCatalogItemId: "mat-adhesive", quantityPerUnit: 4, wasteFactorPercent: 0 },
    ],
  };

  const paintRateItem: RateItemForCalc = {
    id: "rate-paint",
    laborHoursPerUnit: 0.2,
    materials: [{ materialCatalogItemId: "mat-paint", quantityPerUnit: 0.15, wasteFactorPercent: 10 }],
  };

  const rateItemsById = { [tileRateItem.id]: tileRateItem, [paintRateItem.id]: paintRateItem };

  const materialPricesById: Record<string, MaterialPrice> = {
    "mat-tile": { unitPrice: 25, unit: "m2" },
    "mat-adhesive": { unitPrice: 2, unit: "kg" },
    "mat-paint": { unitPrice: 8, unit: "L" },
  };

  it("computes materials cost including waste factor", () => {
    const result = calculateEstimate(
      [{ id: "line-1", rateCatalogItemId: "rate-tile", quantity: 10 }],
      rateItemsById,
      materialPricesById,
      { laborRatePerHour: 30, markupPercent: 0, taxPercent: 0 },
    );

    // tile: 10m2 * 1.05 waste * 25/m2 = 262.5 ; adhesive: 10 * 4 * 2 = 80
    expect(result.lines[0].materialsCost).toBeCloseTo(342.5, 2);
  });

  it("computes labor cost from laborHoursPerUnit * quantity * laborRatePerHour", () => {
    const result = calculateEstimate(
      [{ id: "line-1", rateCatalogItemId: "rate-tile", quantity: 10 }],
      rateItemsById,
      materialPricesById,
      { laborRatePerHour: 30, markupPercent: 0, taxPercent: 0 },
    );

    // 10 * 0.5h * 30/h = 150
    expect(result.lines[0].laborCost).toBeCloseTo(150, 2);
  });

  it("rolls up material requirements across multiple lines using the same material", () => {
    const sharedAdhesiveItem: RateItemForCalc = {
      id: "rate-tile-2",
      laborHoursPerUnit: 0.4,
      materials: [{ materialCatalogItemId: "mat-adhesive", quantityPerUnit: 2, wasteFactorPercent: 0 }],
    };
    const result = calculateEstimate(
      [
        { id: "line-1", rateCatalogItemId: "rate-tile", quantity: 10 },
        { id: "line-2", rateCatalogItemId: "rate-tile-2", quantity: 5 },
      ],
      { ...rateItemsById, [sharedAdhesiveItem.id]: sharedAdhesiveItem },
      materialPricesById,
      { laborRatePerHour: 30, markupPercent: 0, taxPercent: 0 },
    );

    const adhesive = result.materialRequirements.find((r) => r.materialCatalogItemId === "mat-adhesive");
    // line-1: 10*4=40 ; line-2: 5*2=10 => 50 total
    expect(adhesive?.quantity).toBeCloseTo(50, 2);
  });

  it("applies markup on the subtotal (materials + labor), not per line", () => {
    const result = calculateEstimate(
      [{ id: "line-1", rateCatalogItemId: "rate-paint", quantity: 100 }],
      rateItemsById,
      materialPricesById,
      { laborRatePerHour: 20, markupPercent: 15, taxPercent: 0 },
    );

    // materials: 100 * 0.15 * 1.10 * 8 = 132 ; labor: 100*0.2*20 = 400 ; subtotal = 532
    expect(result.subtotal).toBeCloseTo(532, 2);
    expect(result.markupAmount).toBeCloseTo(532 * 0.15, 2);
    expect(result.grandTotal).toBeCloseTo(532 * 1.15, 2);
  });

  it("applies tax on top of subtotal + markup", () => {
    const result = calculateEstimate(
      [{ id: "line-1", rateCatalogItemId: "rate-paint", quantity: 100 }],
      rateItemsById,
      materialPricesById,
      { laborRatePerHour: 20, markupPercent: 10, taxPercent: 19 },
    );

    const subtotal = 532;
    const withMarkup = subtotal * 1.1;
    const expectedTax = withMarkup * 0.19;
    expect(result.taxAmount).toBeCloseTo(expectedTax, 1);
    expect(result.grandTotal).toBeCloseTo(withMarkup + expectedTax, 1);
  });

  it("throws on an unknown rate catalog item", () => {
    expect(() =>
      calculateEstimate(
        [{ id: "line-1", rateCatalogItemId: "does-not-exist", quantity: 1 }],
        rateItemsById,
        materialPricesById,
        { laborRatePerHour: 30, markupPercent: 0, taxPercent: 0 },
      ),
    ).toThrow(/Unknown rate catalog item/);
  });

  it("returns zeroed totals for an empty line list", () => {
    const result = calculateEstimate([], rateItemsById, materialPricesById, {
      laborRatePerHour: 30,
      markupPercent: 15,
      taxPercent: 19,
    });
    expect(result.grandTotal).toBe(0);
    expect(result.materialRequirements).toHaveLength(0);
  });
});
