"use client";

import { useCan } from "@/lib/permissions";
import { PunchListPanel } from "@/components/punch-list-panel";
import { RfiPanel } from "@/components/rfi-panel";
import { MeetingsPanel } from "@/components/meetings-panel";
import { LongLeadItemsPanel } from "@/components/long-lead-items-panel";
import { QualityPanel } from "@/components/quality-panel";
import { ConcreteQcPanel } from "@/components/concrete-qc-panel";
import { SubmittalsPanel } from "@/components/submittals-panel";
import { TransmittalsPanel } from "@/components/transmittals-panel";
import { WarrantyPanel } from "@/components/warranty-panel";
import { AutodeskSyncPanel } from "@/components/autodesk-sync-panel";

/** The project's "Quality" tab; loaded on demand by ProjectDetail. `project` is null while it loads. */
export function QualityTab({ projectId, project }: { projectId: string; project: { autodeskProjectId: string | null } | null }) {
  const can = useCan();
  return (
    <>
      <PunchListPanel projectId={projectId} />
      <RfiPanel projectId={projectId} />
      {can("site.manage") && <MeetingsPanel projectId={projectId} />}
      {can("site.manage") && <LongLeadItemsPanel projectId={projectId} />}
      {can("site.manage") && <QualityPanel projectId={projectId} />}
      {can("site.manage") && <ConcreteQcPanel projectId={projectId} />}
      {can("site.manage") && <SubmittalsPanel projectId={projectId} />}
      {can("site.manage") && <TransmittalsPanel projectId={projectId} />}
      {can("site.manage") && <WarrantyPanel projectId={projectId} />}
      {project && <AutodeskSyncPanel projectId={projectId} initialAutodeskProjectId={project.autodeskProjectId} />}
    </>
  );
}
