/**
 * Pure, framework-free estimate calculation engine — the flagship "auto-generate
 * an estimate and its material list from quantities" logic. No Prisma, no Nest,
 * so it stays trivially unit-testable and could be reused client-side later for
 * a live preview without a round trip.
 */

export interface RateItemMaterialNorm {
  materialCatalogItemId: string;
  quantityPerUnit: number;
  wasteFactorPercent: number;
}

export interface RateItemForCalc {
  id: string;
  laborHoursPerUnit: number;
  materials: RateItemMaterialNorm[];
}

export interface MaterialPrice {
  unitPrice: number;
  unit: string;
}

export interface EstimateLineInput {
  id: string;
  rateCatalogItemId: string;
  quantity: number;
}

export interface EstimateCalcOptions {
  laborRatePerHour: number;
  markupPercent: number;
  taxPercent: number;
}

export interface EstimateLineResult {
  id: string;
  materialsCost: number;
  laborCost: number;
  lineTotal: number;
}

export interface MaterialRequirement {
  materialCatalogItemId: string;
  quantity: number;
  unit: string;
}

export interface EstimateCalcResult {
  lines: EstimateLineResult[];
  materialsCostTotal: number;
  laborCostTotal: number;
  subtotal: number;
  markupAmount: number;
  taxAmount: number;
  grandTotal: number;
  materialRequirements: MaterialRequirement[];
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function calculateEstimate(
  lines: EstimateLineInput[],
  rateItemsById: Record<string, RateItemForCalc>,
  materialPricesById: Record<string, MaterialPrice>,
  options: EstimateCalcOptions,
): EstimateCalcResult {
  const lineResults: EstimateLineResult[] = [];
  const requirementTotals = new Map<string, number>();

  let materialsCostTotal = 0;
  let laborCostTotal = 0;

  for (const line of lines) {
    const rateItem = rateItemsById[line.rateCatalogItemId];
    if (!rateItem) {
      throw new Error(`Unknown rate catalog item: ${line.rateCatalogItemId}`);
    }

    let lineMaterialsCost = 0;
    for (const norm of rateItem.materials) {
      const price = materialPricesById[norm.materialCatalogItemId];
      if (!price) {
        throw new Error(`Unknown material catalog item: ${norm.materialCatalogItemId}`);
      }
      const requiredQty = line.quantity * norm.quantityPerUnit * (1 + norm.wasteFactorPercent / 100);
      lineMaterialsCost += requiredQty * price.unitPrice;

      requirementTotals.set(
        norm.materialCatalogItemId,
        (requirementTotals.get(norm.materialCatalogItemId) ?? 0) + requiredQty,
      );
    }

    const lineLaborCost = line.quantity * rateItem.laborHoursPerUnit * options.laborRatePerHour;
    const lineTotal = lineMaterialsCost + lineLaborCost;

    materialsCostTotal += lineMaterialsCost;
    laborCostTotal += lineLaborCost;

    lineResults.push({
      id: line.id,
      materialsCost: round2(lineMaterialsCost),
      laborCost: round2(lineLaborCost),
      lineTotal: round2(lineTotal),
    });
  }

  const subtotal = materialsCostTotal + laborCostTotal;
  const markupAmount = subtotal * (options.markupPercent / 100);
  const taxAmount = (subtotal + markupAmount) * (options.taxPercent / 100);
  const grandTotal = subtotal + markupAmount + taxAmount;

  const materialRequirements: MaterialRequirement[] = Array.from(requirementTotals.entries()).map(
    ([materialCatalogItemId, quantity]) => ({
      materialCatalogItemId,
      quantity: round2(quantity),
      unit: materialPricesById[materialCatalogItemId]?.unit ?? "",
    }),
  );

  return {
    lines: lineResults,
    materialsCostTotal: round2(materialsCostTotal),
    laborCostTotal: round2(laborCostTotal),
    subtotal: round2(subtotal),
    markupAmount: round2(markupAmount),
    taxAmount: round2(taxAmount),
    grandTotal: round2(grandTotal),
    materialRequirements,
  };
}
