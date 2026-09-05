const round3 = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000;

export interface ProductivityLogEntry {
  quantityCompleted: number;
  laborHours: number;
}

export interface ProductivityRateSummary {
  totalQuantityCompleted: number;
  totalLaborHours: number;
  hoursPerUnit: number | null;
  unitsPerHour: number | null;
}

/** Rolls up a set of logged entries into an hours-per-unit productivity rate for benchmarking. */
export function calculateProductivityRate(entries: ProductivityLogEntry[]): ProductivityRateSummary {
  const totalQuantityCompleted = round3(entries.reduce((sum, e) => sum + e.quantityCompleted, 0));
  const totalLaborHours = round3(entries.reduce((sum, e) => sum + e.laborHours, 0));

  return {
    totalQuantityCompleted,
    totalLaborHours,
    hoursPerUnit: totalQuantityCompleted > 0 ? round3(totalLaborHours / totalQuantityCompleted) : null,
    unitsPerHour: totalLaborHours > 0 ? round3(totalQuantityCompleted / totalLaborHours) : null,
  };
}
