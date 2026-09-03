import { matchVendorBill } from "./vendor-bill-match";

describe("matchVendorBill()", () => {
  it("returns no_po when the bill has no purchase order", () => {
    const result = matchVendorBill(null, [{ materialCatalogItemId: "m1", quantity: 10, unitPrice: 5 }]);
    expect(result.status).toBe("no_po");
    expect(result.lines).toHaveLength(0);
  });

  it("matches when billed quantity and price equal the ordered amounts", () => {
    const result = matchVendorBill(
      [{ materialCatalogItemId: "m1", quantity: 10, unitPrice: 5 }],
      [{ materialCatalogItemId: "m1", quantity: 10, unitPrice: 5 }],
    );
    expect(result.status).toBe("matched");
    expect(result.lines[0].quantityVariance).toBe(0);
    expect(result.lines[0].priceVariance).toBe(0);
  });

  it("flags a variance when the billed quantity exceeds what was ordered", () => {
    const result = matchVendorBill(
      [{ materialCatalogItemId: "m1", quantity: 10, unitPrice: 5 }],
      [{ materialCatalogItemId: "m1", quantity: 12, unitPrice: 5 }],
    );
    expect(result.status).toBe("variance");
    expect(result.lines[0].quantityVariance).toBe(2);
  });

  it("flags a variance when the billed unit price differs from the ordered price", () => {
    const result = matchVendorBill(
      [{ materialCatalogItemId: "m1", quantity: 10, unitPrice: 5 }],
      [{ materialCatalogItemId: "m1", quantity: 10, unitPrice: 6 }],
    );
    expect(result.status).toBe("variance");
    expect(result.lines[0].priceVariance).toBe(10);
  });

  it("sums multiple PO lines for the same material before comparing", () => {
    const result = matchVendorBill(
      [
        { materialCatalogItemId: "m1", quantity: 5, unitPrice: 5 },
        { materialCatalogItemId: "m1", quantity: 5, unitPrice: 5 },
      ],
      [{ materialCatalogItemId: "m1", quantity: 10, unitPrice: 5 }],
    );
    expect(result.status).toBe("matched");
  });

  it("excludes a bill line with no materialCatalogItemId from the comparison", () => {
    const result = matchVendorBill(
      [{ materialCatalogItemId: "m1", quantity: 10, unitPrice: 5 }],
      [
        { materialCatalogItemId: "m1", quantity: 10, unitPrice: 5 },
        { materialCatalogItemId: undefined as unknown as string, quantity: 1, unitPrice: 100 },
      ],
    );
    expect(result.status).toBe("matched");
    expect(result.lines).toHaveLength(1);
  });

  it("flags a material billed but never ordered as a variance", () => {
    const result = matchVendorBill(
      [{ materialCatalogItemId: "m1", quantity: 10, unitPrice: 5 }],
      [{ materialCatalogItemId: "m2", quantity: 3, unitPrice: 5 }],
    );
    expect(result.status).toBe("variance");
    expect(result.lines).toHaveLength(2);
  });
});
