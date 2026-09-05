export interface ClassifyReceivingLineInput {
  orderedQuantity: number;
  previouslyReceived: number;
  thisPassReceived: number;
  thisPassDamaged: number;
  shortfallType?: "short_ship" | "backorder";
}

export interface DetectedDiscrepancy {
  type: "short_ship" | "over_ship" | "damaged" | "backorder";
  quantity: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * over_ship and damaged are detected automatically from the quantities alone. A shortfall
 * (received less than ordered) is NOT auto-classified — whether more stock is still coming
 * (backorder) or it's simply not arriving (short_ship) is a judgment call only the person
 * receiving the shipment can make, passed in as `shortfallType`; omitting it when there's a
 * shortfall means no discrepancy is recorded yet (e.g. mid-shipment, still expecting more today).
 */
export function classifyReceivingLine(input: ClassifyReceivingLineInput): DetectedDiscrepancy[] {
  const discrepancies: DetectedDiscrepancy[] = [];

  if (input.thisPassDamaged > 0) {
    discrepancies.push({ type: "damaged", quantity: round2(input.thisPassDamaged) });
  }

  const newCumulativeReceived = input.previouslyReceived + input.thisPassReceived;
  if (newCumulativeReceived > input.orderedQuantity) {
    discrepancies.push({ type: "over_ship", quantity: round2(newCumulativeReceived - input.orderedQuantity) });
  } else if (newCumulativeReceived < input.orderedQuantity && input.shortfallType) {
    discrepancies.push({ type: input.shortfallType, quantity: round2(input.orderedQuantity - newCumulativeReceived) });
  }

  return discrepancies;
}
