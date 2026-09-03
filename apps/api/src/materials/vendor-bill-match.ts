const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface MatchLineInput {
  materialCatalogItemId: string;
  quantity: number;
  unitPrice: number;
}

export interface MatchLineResult {
  materialCatalogItemId: string;
  orderedQuantity: number;
  orderedUnitPrice: number;
  billedQuantity: number;
  billedUnitPrice: number;
  quantityVariance: number;
  priceVariance: number;
}

export type VendorBillMatchStatus = "no_po" | "matched" | "variance";

export interface MatchResult {
  status: VendorBillMatchStatus;
  lines: MatchLineResult[];
}

/**
 * Sums PO lines and bill lines by materialCatalogItemId (a bill can split or combine PO lines
 * differently) and compares the totals. A bill line with no materialCatalogItemId (a service
 * charge) or a PO with no matching material is excluded from the comparison — only lines present
 * on both sides can be matched. A tolerance of 1 cent absorbs rounding, not real variance.
 */
export function matchVendorBill(poLines: MatchLineInput[] | null, billLines: MatchLineInput[]): MatchResult {
  if (!poLines) return { status: "no_po", lines: [] };

  const orderedByItem = new Map<string, { quantity: number; unitPrice: number }>();
  for (const line of poLines) {
    const existing = orderedByItem.get(line.materialCatalogItemId);
    orderedByItem.set(line.materialCatalogItemId, {
      quantity: (existing?.quantity ?? 0) + line.quantity,
      unitPrice: line.unitPrice,
    });
  }

  const billedByItem = new Map<string, { quantity: number; unitPrice: number }>();
  for (const line of billLines) {
    if (!line.materialCatalogItemId) continue;
    const existing = billedByItem.get(line.materialCatalogItemId);
    billedByItem.set(line.materialCatalogItemId, {
      quantity: (existing?.quantity ?? 0) + line.quantity,
      unitPrice: line.unitPrice,
    });
  }

  const itemIds = new Set([...orderedByItem.keys(), ...billedByItem.keys()]);
  const lines: MatchLineResult[] = [];
  let hasVariance = false;

  for (const materialCatalogItemId of itemIds) {
    const ordered = orderedByItem.get(materialCatalogItemId) ?? { quantity: 0, unitPrice: 0 };
    const billed = billedByItem.get(materialCatalogItemId) ?? { quantity: 0, unitPrice: 0 };
    const quantityVariance = round2(billed.quantity - ordered.quantity);
    const priceVariance = round2(billed.unitPrice * billed.quantity - ordered.unitPrice * ordered.quantity);
    if (Math.abs(quantityVariance) > 0.01 || Math.abs(priceVariance) > 0.01) hasVariance = true;

    lines.push({
      materialCatalogItemId,
      orderedQuantity: ordered.quantity,
      orderedUnitPrice: ordered.unitPrice,
      billedQuantity: billed.quantity,
      billedUnitPrice: billed.unitPrice,
      quantityVariance,
      priceVariance,
    });
  }

  return { status: hasVariance ? "variance" : "matched", lines };
}
