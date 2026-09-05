export interface CloseoutReadinessInput {
  asBuiltCount: number;
  omManualCount: number;
  openPunchList: number;
  openRfis: number;
  openWarrantyClaims: number;
}

export interface CloseoutReadiness extends CloseoutReadinessInput {
  ready: boolean;
  missing: string[];
}

/** A project is handoff-ready once as-builts and O&M manuals are on file and nothing is still open. */
export function computeCloseoutReadiness(input: CloseoutReadinessInput): CloseoutReadiness {
  const missing: string[] = [];
  if (input.asBuiltCount === 0) missing.push("as_built");
  if (input.omManualCount === 0) missing.push("om_manual");
  if (input.openPunchList > 0) missing.push("punch_list");
  if (input.openRfis > 0) missing.push("rfis");
  if (input.openWarrantyClaims > 0) missing.push("warranty_claims");

  return { ...input, ready: missing.length === 0, missing };
}
