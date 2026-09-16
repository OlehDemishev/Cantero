export interface UnitConversionInfo {
  id: string;
  baseUnitId: string | null;
  factorToBase: number | null;
}

export class UnitConversionError extends Error {}

const round6 = (n: number): number => Math.round((n + Number.EPSILON) * 1_000_000) / 1_000_000;

/** The unit's own base id — itself if it IS a base unit (baseUnitId null), otherwise the id it converts to. */
function baseIdOf(unit: UnitConversionInfo): string {
  return unit.baseUnitId ?? unit.id;
}

/**
 * Converts `quantity` denominated in `from` to the equivalent denominated in `to`. Both units
 * must belong to the same two-level family (the same unit, one being the other's base, or both
 * sharing a base) — mirrors the shape of consumeLotsByExpiry/selectUnitsForConsumption: a pure
 * function operating on plain data, no Prisma. Throws UnitConversionError rather than guessing
 * when the two units don't share a base (e.g. converting "box of 12" to "meter" makes no sense).
 */
export function convertUnitQuantity(quantity: number, from: UnitConversionInfo, to: UnitConversionInfo): number {
  if (from.id === to.id) return quantity;

  const fromBaseId = baseIdOf(from);
  const toBaseId = baseIdOf(to);
  if (fromBaseId !== toBaseId) {
    throw new UnitConversionError(`Units "${from.id}" and "${to.id}" don't share a common base unit`);
  }

  // quantity in `from`'s own unit, converted to the shared base
  const inBase = from.baseUnitId === null ? quantity : quantity * from.factorToBase!;
  // base quantity converted into `to`'s own unit
  const result = to.baseUnitId === null ? inBase : inBase / to.factorToBase!;
  return round6(result);
}
