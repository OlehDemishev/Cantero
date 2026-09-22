-- AlterEnum
ALTER TYPE "TakeoffMeasurementType" ADD VALUE 'count';

-- AlterTable
ALTER TABLE "drawing_sheets" ADD COLUMN     "drawingSetId" TEXT,
ADD COLUMN     "sourcePage" INTEGER;

-- AlterTable
ALTER TABLE "takeoffs" ADD COLUMN     "pageNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "sourceSheetId" TEXT;

-- CreateTable
CREATE TABLE "drawing_sets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "analysis" JSONB NOT NULL,
    "uploadedByUserId" TEXT,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drawing_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawing_sheet_links" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "drawing_sheet_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drawing_sets_projectId_idx" ON "drawing_sets"("projectId");

-- CreateIndex
CREATE INDEX "drawing_sheet_links_sheetId_idx" ON "drawing_sheet_links"("sheetId");

-- CreateIndex
CREATE INDEX "drawing_sheet_links_targetKey_idx" ON "drawing_sheet_links"("targetKey");

-- AddForeignKey
ALTER TABLE "takeoffs" ADD CONSTRAINT "takeoffs_sourceSheetId_fkey" FOREIGN KEY ("sourceSheetId") REFERENCES "drawing_sheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_sheets" ADD CONSTRAINT "drawing_sheets_drawingSetId_fkey" FOREIGN KEY ("drawingSetId") REFERENCES "drawing_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_sets" ADD CONSTRAINT "drawing_sets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_sets" ADD CONSTRAINT "drawing_sets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_sheet_links" ADD CONSTRAINT "drawing_sheet_links_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "drawing_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

