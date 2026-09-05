export interface MarkupRuleForCalc {
  costType: "materials" | "labor";
  markupPercent: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Computes markup separately on the materials and labor portions of a change order's subtotal,
 * using a company MarkupRule for each cost type when one exists, falling back to the parent
 * estimate's single flat markupPercent for whichever cost type has no rule configured. Returns
 * the combined markup amount — the caller still adds tax on top, same as the flat-rate path.
 */
export function calculateTieredMarkup(
  materialsCostTotal: number,
  laborCostTotal: number,
  fallbackMarkupPercent: number,
  rules: MarkupRuleForCalc[],
): number {
  const materialsPercent = rules.find((r) => r.costType === "materials")?.markupPercent ?? fallbackMarkupPercent;
  const laborPercent = rules.find((r) => r.costType === "labor")?.markupPercent ?? fallbackMarkupPercent;
  const markup = materialsCostTotal * (materialsPercent / 100) + laborCostTotal * (laborPercent / 100);
  return round2(markup);
}
