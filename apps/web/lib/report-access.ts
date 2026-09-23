"use client";

import { canViewReport, type ReportKey } from "@cantero/shared";
import { useMe } from "./use-me";

/**
 * Whether the signed-in member may open a built-in report — the same REPORT_PERMISSIONS table the
 * API's @Requires reads, so a panel is left out instead of sitting empty on a refused request. False
 * until /me has loaded, so nothing is fetched for a member who can't have it.
 */
export function useReportAccess(): (report: ReportKey) => boolean {
  const { data: me } = useMe();
  return (report) => !!me && canViewReport(report, me.user.permissions);
}
