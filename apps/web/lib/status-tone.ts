/**
 * The one place that says which colour a record's status gets — every status badge in the app
 * reads its tone from here instead of keeping its own status→class map.
 *
 *   neutral  not started, inactive, nothing to do (draft, planned, closed without outcome)
 *   brand    in someone's hands / under way (submitted, in progress, active)
 *   info     informational, no action implied
 *   warning  waiting on someone, needs attention soon (sent, pending, under review, at risk)
 *   success  done with a good outcome (approved, paid, signed, verified)
 *   danger   failed, refused, overdue or harmful (rejected, void, expired, critical)
 *
 * A status that means something different in one domain gets a domain override below rather than
 * a separate map in the component.
 */
export type Tone = "neutral" | "brand" | "info" | "success" | "warning" | "danger";

const DEFAULT_TONES: Record<string, Tone> = {
  // neutral
  draft: "neutral",
  planned: "neutral",
  open: "neutral",
  new: "neutral",
  filed: "neutral",
  notice_given: "neutral",
  pending_review: "neutral",
  pending_testing: "neutral",
  tracking: "neutral",
  applied: "neutral",
  cancelled: "neutral",
  canceled: "neutral",
  maintenance: "neutral",
  terminated: "neutral",
  unscheduled: "neutral",
  inactive: "neutral",
  archived: "neutral",
  none: "neutral",
  low: "neutral",
  minor: "neutral",
  near_miss: "neutral",
  subcontractor: "neutral",
  enrolled: "neutral",
  committed: "neutral",
  on_hold: "neutral",
  // brand — under way
  in_progress: "brand",
  active: "brand",
  submitted: "brand",
  negotiating: "brand",
  matched: "brand",
  interviewing: "brand",
  investigating: "brand",
  rented_out: "brand",
  in_fabrication: "brand",
  shipped: "brand",
  internal: "brand",
  medium: "brand",
  normal: "brand",
  meets_expectations: "brand",
  first_aid: "brand",
  // warning — waiting on someone / needs attention
  pending: "warning",
  sent: "warning",
  ordered: "warning",
  partially_paid: "warning",
  partial: "warning",
  answered: "warning",
  under_review: "warning",
  waiting_on_customer: "warning",
  in_use: "warning",
  testing: "warning",
  screening: "warning",
  offer: "warning",
  revise_and_resubmit: "warning",
  disputed: "warning",
  waived: "warning",
  contained: "warning",
  expiring_soon: "warning",
  watch: "warning",
  client: "warning",
  major: "warning",
  moderate: "warning",
  medical_treatment: "warning",
  // success
  approved: "success",
  approved_as_noted: "success",
  accepted: "success",
  signed: "success",
  paid: "success",
  paid_off: "success",
  received: "success",
  confirmed: "success",
  delivered: "success",
  completed: "success",
  complete: "success",
  done: "success",
  closed: "success",
  resolved: "success",
  verified: "success",
  settled: "success",
  converted: "success",
  hired: "success",
  deducted: "success",
  cured: "success",
  released: "success",
  funded: "success",
  awarded: "success",
  passed: "success",
  available: "success",
  valid: "success",
  good: "success",
  on_track: "success",
  delivered_on_time: "success",
  exceeds_expectations: "success",
  // danger
  rejected: "danger",
  denied: "danger",
  declined: "danger",
  void: "danger",
  voided: "danger",
  failed: "danger",
  missed: "danger",
  defaulted: "danger",
  retired: "danger",
  expired: "danger",
  exceeded: "danger",
  overdue: "danger",
  issued: "danger",
  delivered_late: "danger",
  at_risk: "danger",
  critical: "danger",
  high: "danger",
  urgent: "danger",
  fatality: "danger",
  lost_time_injury: "danger",
  below_expectations: "danger",
};

/** Statuses whose tone in a given domain differs from the default above. */
const DOMAIN_TONES = {
  /** Quality deficiencies: an open one is a defect; "resolved" still awaits verification. */
  deficiency: { open: "danger", resolved: "warning" },
  /** Punch-list items: "resolved" still awaits the walk-through that verifies it. */
  punchList: { resolved: "warning" },
  /** Environmental incidents: minor / moderate / major, so "major" is the worst. */
  environmental: { major: "danger" },
  /** Long-lead items: "at risk" is a warning; "critical" is the red one. */
  longLead: { at_risk: "warning" },
  /** Insurance claims: "approved" is not paid yet (that's "settled"); closed says nothing about outcome. */
  insuranceClaim: { approved: "brand", closed: "neutral" },
  /** Surety bonds: an active bond is the good state; a released one is simply over. */
  suretyBond: { active: "success", released: "neutral" },
  /** Lien filings: a filed lien needs attention; a disputed one is a problem. */
  lienFiling: { filed: "warning", disputed: "danger" },
  /** Allowances: active is the normal state, nothing to flag. */
  allowance: { active: "neutral" },
} satisfies Record<string, Record<string, Tone>>;

export type StatusDomain = keyof typeof DOMAIN_TONES;

/** The badge/notice tone for a status value; unknown statuses are neutral. */
export function statusTone(status: string | null | undefined, domain?: StatusDomain): Tone {
  if (!status) return "neutral";
  const override = domain ? (DOMAIN_TONES[domain] as Record<string, Tone>)[status] : undefined;
  return override ?? DEFAULT_TONES[status] ?? "neutral";
}
