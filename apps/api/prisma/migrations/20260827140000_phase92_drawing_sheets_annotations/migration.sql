-- CreateEnum
CREATE TYPE "AnnotationType" AS ENUM ('freehand', 'rectangle', 'cloud', 'arrow', 'text');

-- AlterTable
ALTER TABLE "punch_list_items" ADD COLUMN     "drawingSheetId" TEXT,
ADD COLUMN     "pinX" DOUBLE PRECISION,
ADD COLUMN     "pinY" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "rfis" ADD COLUMN     "drawingSheetId" TEXT,
ADD COLUMN     "pinX" DOUBLE PRECISION,
ADD COLUMN     "pinY" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "drawing_sheets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sheetNumber" TEXT NOT NULL,
    "discipline" TEXT,
    "title" TEXT,
    "revision" TEXT,
    "revisionDate" TIMESTAMP(3),
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drawing_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annotations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "drawingSheetId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "type" "AnnotationType" NOT NULL,
    "points" JSONB NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#e11d48',
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drawing_sheets_companyId_idx" ON "drawing_sheets"("companyId");

-- CreateIndex
CREATE INDEX "drawing_sheets_projectId_idx" ON "drawing_sheets"("projectId");

-- CreateIndex
CREATE INDEX "annotations_drawingSheetId_idx" ON "annotations"("drawingSheetId");

-- AddForeignKey
ALTER TABLE "punch_list_items" ADD CONSTRAINT "punch_list_items_drawingSheetId_fkey" FOREIGN KEY ("drawingSheetId") REFERENCES "drawing_sheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_drawingSheetId_fkey" FOREIGN KEY ("drawingSheetId") REFERENCES "drawing_sheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_sheets" ADD CONSTRAINT "drawing_sheets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_sheets" ADD CONSTRAINT "drawing_sheets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_drawingSheetId_fkey" FOREIGN KEY ("drawingSheetId") REFERENCES "drawing_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

