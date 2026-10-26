"use client";

import { useCan } from "@/lib/permissions";
import { DailyLogsPanel } from "@/components/daily-logs-panel";
import { CrewSmsBroadcastPanel } from "@/components/crew-sms-broadcast-panel";
import { SiteSignInsPanel } from "@/components/site-sign-ins-panel";
import { WeatherForecastPanel } from "@/components/weather-forecast-panel";
import { WeatherDelayReportPanel } from "@/components/weather-delay-report-panel";
import { GeofencePanel } from "@/components/geofence-panel";
import { SafetyPanel } from "@/components/safety-panel";
import { SafetyObservationsPanel } from "@/components/safety-observations-panel";

/** The project's "Field" tab; loaded on demand by ProjectDetail. */
export function FieldTab({ projectId }: { projectId: string }) {
  const can = useCan();
  return (
    <>
      <DailyLogsPanel projectId={projectId} />
      {can("site.manage") && <CrewSmsBroadcastPanel projectId={projectId} />}
      <SiteSignInsPanel projectId={projectId} />
      <WeatherForecastPanel projectId={projectId} />
      {can("site.manage") && <WeatherDelayReportPanel projectId={projectId} />}
      {can("projects.manage") && <GeofencePanel projectId={projectId} />}
      <SafetyPanel projectId={projectId} />
      <SafetyObservationsPanel projectId={projectId} />
    </>
  );
}
