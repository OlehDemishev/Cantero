"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { DrawingSheetViewer } from "@/components/drawing-sheet-viewer";
import { apiFetch } from "@/lib/api-client";

export default function DrawingSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("drawings");
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
    </AuthenticatedShell>
  );
}
