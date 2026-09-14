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
/** Merges same-item lines by summing quantity and dollar amount rather than keeping one line's
 * unitPrice — a PO or bill can carry more than one line for the same material (e.g. a
 * mid-order price change, or a manually duplicated line), and picking just the last price seen
 * would misrepresent both the displayed unit price and, worse, the price variance total. */
function mergeByItem(lines: MatchLineInput[]): Map<string, { quantity: number; amount: number }> {
  const byItem = new Map<string, { quantity: number; amount: number }>();
  for (const line of lines) {
    if (!line.materialCatalogItemId) continue;
    const existing = byItem.get(line.materialCatalogItemId) ?? { quantity: 0, amount: 0 };
    byItem.set(line.materialCatalogItemId, {
      quantity: existing.quantity + line.quantity,
      amount: existing.amount + line.quantity * line.unitPrice,
    });
  }
  return byItem;
}

export function matchVendorBill(poLines: MatchLineInput[] | null, billLines: MatchLineInput[]): MatchResult {
  if (!poLines) return { status: "no_po", lines: [] };

  const orderedByItem = mergeByItem(poLines);
  const billedByItem = mergeByItem(billLines);

  const itemIds = new Set([...orderedByItem.keys(), ...billedByItem.keys()]);
  const lines: MatchLineResult[] = [];
  let hasVariance = false;

  for (const materialCatalogItemId of itemIds) {
    const ordered = orderedByItem.get(materialCatalogItemId) ?? { quantity: 0, amount: 0 };
    const billed = billedByItem.get(materialCatalogItemId) ?? { quantity: 0, amount: 0 };
    const quantityVariance = round2(billed.quantity - ordered.quantity);
    const priceVariance = round2(billed.amount - ordered.amount);
    if (Math.abs(quantityVariance) > 0.01 || Math.abs(priceVariance) > 0.01) hasVariance = true;

    lines.push({
      materialCatalogItemId,
      orderedQuantity: ordered.quantity,
      orderedUnitPrice: ordered.quantity > 0 ? round2(ordered.amount / ordered.quantity) : 0,
      billedQuantity: billed.quantity,
      billedUnitPrice: billed.quantity > 0 ? round2(billed.amount / billed.quantity) : 0,
      quantityVariance,
      priceVariance,
    });
  }

  return { status: hasVariance ? "variance" : "matched", lines };
}
