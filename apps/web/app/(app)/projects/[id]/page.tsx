import { Suspense } from "react";
import { ProjectDetail } from "@/components/project-detail";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <ProjectDetail projectId={id} />
    </Suspense>
  );
}
