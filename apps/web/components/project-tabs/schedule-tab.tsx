"use client";

import { useCan } from "@/lib/permissions";
import { SchedulingPanel } from "@/components/scheduling-panel";
import { ScheduleBaselinePanel } from "@/components/schedule-baseline-panel";
import { ScheduleScenariosPanel } from "@/components/schedule-scenarios-panel";
import { LookAheadPanel } from "@/components/look-ahead-panel";
import { ProgressTrackingPanel } from "@/components/progress-tracking-panel";
import { CommissioningPanel } from "@/components/commissioning-panel";
import { ScheduleFilesPanel } from "@/components/schedule-files-panel";
import { MsProjectSyncPanel } from "@/components/ms-project-sync-panel";

/** The project's "Schedule" tab; loaded on demand by ProjectDetail. */
export function ScheduleTab({ projectId }: { projectId: string }) {
  const can = useCan();
  return (
    <>
      <SchedulingPanel projectId={projectId} />
      {can("site.manage") && <ScheduleBaselinePanel projectId={projectId} />}
      {can("site.manage") && <ScheduleScenariosPanel projectId={projectId} />}
      <LookAheadPanel projectId={projectId} />
      {can("site.manage") && <ProgressTrackingPanel projectId={projectId} />}
      {can("site.manage") && <CommissioningPanel projectId={projectId} />}
      {can("site.manage") && <ScheduleFilesPanel projectId={projectId} />}
      {can("site.manage") && <MsProjectSyncPanel projectId={projectId} />}
    </>
  );
}
