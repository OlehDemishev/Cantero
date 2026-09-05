export interface ProfitabilityInput {
  materialsCostTotal: number;
  laborCostTotal: number;
  grandTotal: number;
}
export interface ProfitabilityRow {
  cost: number;
  revenue: number;
  margin: number;
  /** null when revenue is 0 — nothing to take a percentage of. */
  marginPercent: number | null;
}
export interface ChangeOrderProfitabilityRow extends ProfitabilityRow {
  id: string;
  number: number;
  title: string;
}
export interface ChangeOrderProfitabilityReport {
  baseContract: ProfitabilityRow;
  changeOrders: ChangeOrderProfitabilityRow[];
  changeOrdersTotal: ProfitabilityRow;
  combined: ProfitabilityRow;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

function toRow(input: ProfitabilityInput): ProfitabilityRow {
  const cost = input.materialsCostTotal + input.laborCostTotal;
  const revenue = input.grandTotal;
  const margin = revenue - cost;
  return { cost: round2(cost), revenue: round2(revenue), margin: round2(margin), marginPercent: revenue > 0 ? round2((margin / revenue) * 100) : null };
}

function sumRows(rows: ProfitabilityInput[]): ProfitabilityRow {
  return toRow({
    materialsCostTotal: rows.reduce((sum, r) => sum + r.materialsCostTotal, 0),
    laborCostTotal: rows.reduce((sum, r) => sum + r.laborCostTotal, 0),
    grandTotal: rows.reduce((sum, r) => sum + r.grandTotal, 0),
  });
}

/**
 * Answers "are our change orders earning better or worse margin than the base contract they're
 * attached to?" — using each change order's own committed cost/price lines (materialsCostTotal +
 * laborCostTotal vs. grandTotal), the same figures the estimate/change-order itself was priced
 * with. This is a *budgeted* margin comparison, not a real-actuals one: nothing in the schema
 * attributes actually-incurred cost (subcontractor spend, stock issues) back to a specific change
 * order rather than the project as a whole, so there's no "did this CO really make the margin it
 * promised" figure to compute — see JobCostingService.report()'s similar cost-code-level scope
 * limit. Only approved change orders are meaningful here (a draft/pending CO's cost lines aren't
 * committed yet), so the caller is expected to have already filtered to status="approved".
 */
export function calculateChangeOrderProfitability(
  baseContract: ProfitabilityInput,
  changeOrders: (ProfitabilityInput & { id: string; number: number; title: string })[],
): ChangeOrderProfitabilityReport {
  const baseRow = toRow(baseContract);
  const coRows = changeOrders.map((co) => ({ id: co.id, number: co.number, title: co.title, ...toRow(co) }));
  const changeOrdersTotal = sumRows(changeOrders);
  const combined = sumRows([baseContract, ...changeOrders]);

  return { baseContract: baseRow, changeOrders: coRows, changeOrdersTotal, combined };
}
