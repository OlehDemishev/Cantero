"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DrawingSheetViewer } from "@/components/drawing-sheet-viewer";
import { DrawingRevisionsPanel } from "@/components/drawing-revisions-panel";
import { ErrorState } from "@/components/ui/error-state";
import { useApi } from "@/lib/use-api";

export default function DrawingSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("drawings");
  const router = useRouter();
  // The same request as the viewer's own (useApi shares it): only the project link is read here.
  const { data: sheet, error, reload } = useApi<{ projectId: string }>(`/drawing-sheets/${id}`);

  if (error && !sheet) return <ErrorState error={error} onRetry={reload} backHref="/drawings" />;

  return (
    <>
      {sheet && (
        <a href={`/projects/${sheet.projectId}`} className="text-sm text-fg-subtle hover:underline">
          ← {t("title")}
        </a>
      )}
      <div className="mt-2">
        <DrawingSheetViewer sheetId={id} />
      </div>
      <DrawingRevisionsPanel sheetId={id} onSuperseded={(newSheetId) => router.push(`/drawings/${newSheetId}`)} />
    </>
  );
}
