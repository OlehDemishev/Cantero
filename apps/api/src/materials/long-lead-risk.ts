import type { LongLeadItemStatus } from "@cantero/shared";

export interface LongLeadRiskSourceItem {
  id: string;
  description: string;
  status: LongLeadItemStatus;
  expectedDeliveryDate: Date | null;
  actualDeliveryDate: Date | null;
  requiredOnSiteDate: Date | null;
}

export type LongLeadRiskLevel = "delivered_on_time" | "delivered_late" | "on_track" | "at_risk" | "critical" | "unscheduled";

export interface LongLeadRiskRow extends LongLeadRiskSourceItem {
  risk: LongLeadRiskLevel;
  /** Days between the best-known delivery date (actual, else expected) and requiredOnSiteDate — negative means it's projected to miss. Null when either date is missing. */
  slackDays: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const AT_RISK_THRESHOLD_DAYS = 14;

/**
 * Flags procurement items whose fabrication/shipping lead time threatens the schedule. Unlike a
 * flat PurchaseOrder.expectedDate check, this compares against requiredOnSiteDate — the date the
 * item actually needs to be on site — so a long-lead item can be "on track" for its supplier's
 * own timeline while still being a schedule risk, and vice versa. Items missing either date are
 * "unscheduled": there isn't enough information yet to assess risk, which is itself worth
 * surfacing separately from "on_track" rather than defaulting to green.
 */
export function calculateLongLeadRisk(items: LongLeadRiskSourceItem[]): LongLeadRiskRow[] {
  return items.map((item) => {
    if (item.status === "delivered") {
      if (item.requiredOnSiteDate === null || item.actualDeliveryDate === null) {
        return { ...item, risk: "delivered_on_time" as const, slackDays: null };
      }
      const slackDays = Math.round((item.requiredOnSiteDate.getTime() - item.actualDeliveryDate.getTime()) / DAY_MS);
      return { ...item, risk: slackDays >= 0 ? ("delivered_on_time" as const) : ("delivered_late" as const), slackDays };
    }

    if (item.requiredOnSiteDate === null || item.expectedDeliveryDate === null) {
      return { ...item, risk: "unscheduled" as const, slackDays: null };
    }

    const slackDays = Math.round((item.requiredOnSiteDate.getTime() - item.expectedDeliveryDate.getTime()) / DAY_MS);
    const risk: LongLeadRiskLevel = slackDays < 0 ? "critical" : slackDays <= AT_RISK_THRESHOLD_DAYS ? "at_risk" : "on_track";
    return { ...item, risk, slackDays };
  });
}
