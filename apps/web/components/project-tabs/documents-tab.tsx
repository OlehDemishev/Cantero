"use client";

import { useCan } from "@/lib/permissions";
import { TakeoffPanel } from "@/components/takeoff-panel";
import { DrawingSheetsPanel } from "@/components/drawing-sheets-panel";
import { BimModelPanel } from "@/components/bim-model-panel";
import { TimeTrackingPanel } from "@/components/time-tracking-panel";
import { ProductivityPanel } from "@/components/productivity-panel";
import { DocumentsPanel } from "@/components/documents-panel";
import { GalleryPanel } from "@/components/gallery-panel";
import { ProjectCloseoutPanel } from "@/components/project-closeout-panel";

/** The project's "Documents" tab; loaded on demand by ProjectDetail. `project` is null while it loads. */
export function DocumentsTab({
  projectId,
  project,
}: {
  projectId: string;
  project: { autodeskProjectId: string | null; autodeskModelUrn: string | null; autodeskModelName: string | null } | null;
}) {
  const can = useCan();
  return (
    <>
      {can("estimates.view") && <TakeoffPanel projectId={projectId} />}
      <DrawingSheetsPanel projectId={projectId} />
      {project && <BimModelPanel projectId={projectId} canEdit={can("site.manage")} initial={project} />}
      <TimeTrackingPanel projectId={projectId} />
      {can("site.manage") && <ProductivityPanel projectId={projectId} />}
      <DocumentsPanel projectId={projectId} />
      <GalleryPanel projectId={projectId} />
      {can("site.manage") && <ProjectCloseoutPanel projectId={projectId} />}
    </>
  );
}
