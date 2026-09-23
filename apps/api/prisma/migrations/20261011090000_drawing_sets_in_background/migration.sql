-- Drawing sets are read and imported in the background: a status with progress and an error,
-- the reviewed pages an import job works from, and a marker for sheets whose links were looked for.
-- CreateEnum
CREATE TYPE "DrawingSetStatus" AS ENUM ('analyzing', 'ready', 'importing', 'imported', 'failed');

-- AlterTable
ALTER TABLE "drawing_sets" ADD COLUMN     "status" "DrawingSetStatus" NOT NULL DEFAULT 'ready',
ADD COLUMN     "pagesRead" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "importPages" JSONB,
ADD COLUMN     "importResult" JSONB,
ADD COLUMN     "finishedAt" TIMESTAMP(3);

-- Sets from before this change were read in the upload request: finished, and imported if they were.
UPDATE "drawing_sets" SET "status" = 'imported' WHERE "importedAt" IS NOT NULL;
UPDATE "drawing_sets" SET "pagesRead" = "pageCount", "finishedAt" = "createdAt";

-- AlterTable
ALTER TABLE "drawing_sheets" ADD COLUMN     "linksScannedAt" TIMESTAMP(3);

-- Sheets that came from a set had their references read at import.
UPDATE "drawing_sheets" SET "linksScannedAt" = "createdAt" WHERE "drawingSetId" IS NOT NULL;
