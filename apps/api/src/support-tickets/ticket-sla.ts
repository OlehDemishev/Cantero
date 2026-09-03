export interface SlaDeadlines {
  slaResponseDueAt: Date | null;
  slaResolutionDueAt: Date | null;
}

/** Stamped onto the ticket at creation time from whatever SlaPolicy row matches its priority —
 * null policy means no SLA is configured for that priority, and the ticket simply carries no
 * deadlines rather than falling back to a guessed default. */
export function calculateSlaDeadlines(
  policy: { responseMinutes: number; resolutionMinutes: number } | null,
  createdAt: Date,
): SlaDeadlines {
  if (!policy) return { slaResponseDueAt: null, slaResolutionDueAt: null };
  return {
    slaResponseDueAt: new Date(createdAt.getTime() + policy.responseMinutes * 60 * 1000),
    slaResolutionDueAt: new Date(createdAt.getTime() + policy.resolutionMinutes * 60 * 1000),
  };
}

export interface SlaBreachStatus {
  responseBreached: boolean;
  resolutionBreached: boolean;
}

/** Computed live against "now" rather than a background job — a response deadline only counts as
 * breached while still unanswered, and a resolution deadline only while the ticket is still open. */
export function calculateSlaBreachStatus(
  ticket: { slaResponseDueAt: Date | null; slaResolutionDueAt: Date | null; firstRespondedAt: Date | null; status: string },
  asOf: Date,
): SlaBreachStatus {
  const responseBreached = !ticket.firstRespondedAt && ticket.slaResponseDueAt !== null && ticket.slaResponseDueAt < asOf;
  const isOpen = ticket.status !== "resolved" && ticket.status !== "closed";
  const resolutionBreached = isOpen && ticket.slaResolutionDueAt !== null && ticket.slaResolutionDueAt < asOf;
  return { responseBreached, resolutionBreached };
}
