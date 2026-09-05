const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface FuelLogEntry {
  quantity: number;
  odometerMiles: number | null;
  idleHours: number | null;
}

export interface FuelEfficiencyResult {
  totalQuantity: number;
  totalIdleHours: number;
  /** Miles driven per unit of fuel, from the span of logged odometer readings — null with fewer than two readings. */
  milesPerUnit: number | null;
}

/** Same "derive from the span of logged readings, don't fabricate from partial data" approach as
 * Equipment's cost-per-hour — mileage comes from odometer deltas across fill-ups, not a single log. */
export function calculateFuelEfficiency(logs: FuelLogEntry[]): FuelEfficiencyResult {
  const totalQuantity = round2(logs.reduce((sum, l) => sum + l.quantity, 0));
  const totalIdleHours = round2(logs.reduce((sum, l) => sum + (l.idleHours ?? 0), 0));

  const odometerReadings = logs.map((l) => l.odometerMiles).filter((m): m is number => m !== null);
  const milesDriven = odometerReadings.length >= 2 ? Math.max(...odometerReadings) - Math.min(...odometerReadings) : null;
  const milesPerUnit = milesDriven !== null && totalQuantity > 0 ? round2(milesDriven / totalQuantity) : null;

  return { totalQuantity, totalIdleHours, milesPerUnit };
}
