-- AlterTable
ALTER TABLE "autodesk_connections" ADD COLUMN     "hubRegion" TEXT,
ADD COLUMN     "viewerAccessToken" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "autodeskModelName" TEXT,
ADD COLUMN     "autodeskModelUrn" TEXT;

