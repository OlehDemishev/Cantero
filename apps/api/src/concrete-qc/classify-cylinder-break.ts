import type { CylinderBreakResult } from "@cantero/shared";

/**
 * A cylinder passes when its break strength meets or exceeds the pour's specified strength — the
 * standard concrete QC rule (spec strength is a minimum, not a target). Returns null when there's
 * no specified strength to compare against, since an unspecified pour's break is neither a pass
 * nor a fail, just a recorded number.
 */
export function classifyCylinderBreak(breakStrength: number, specifiedStrength: number | null): CylinderBreakResult | null {
  if (specifiedStrength === null) return null;
  return breakStrength >= specifiedStrength ? "pass" : "fail";
}
