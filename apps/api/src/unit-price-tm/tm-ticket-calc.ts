const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function calculateTMTicketTotal(laborCost: number, equipmentCost: number, materialCost: number): number {
  return round2(laborCost + equipmentCost + materialCost);
}
