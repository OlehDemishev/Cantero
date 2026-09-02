"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { DrawingSheetViewer } from "@/components/drawing-sheet-viewer";
import { DrawingRevisionsPanel } from "@/components/drawing-revisions-panel";
import { apiFetch } from "@/lib/api-client";

export default function DrawingSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("drawings");
  const router = useRouter();
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ projectId: string }>(`/drawing-sheets/${id}`).then((s) => setProjectId(s.projectId));
  }, [id]);

  return (
    <AuthenticatedShell>
      {projectId && (
        <a href={`/projects/${projectId}`} className="text-sm text-gray-500 hover:underline">
          ← {t("title")}
        </a>
      )}
      <div className="mt-2">
        <DrawingSheetViewer sheetId={id} />
      </div>
      <DrawingRevisionsPanel sheetId={id} onSuperseded={(newSheetId) => router.push(`/drawings/${newSheetId}`)} />
    </AuthenticatedShell>
  );
}
