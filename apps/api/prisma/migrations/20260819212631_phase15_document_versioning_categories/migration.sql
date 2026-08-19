-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('contract', 'permit', 'photo', 'invoice_scan', 'other');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "category" "DocumentCategory" NOT NULL DEFAULT 'other',
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "rootDocumentId" TEXT,
ADD COLUMN     "size" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "uploadedByUserId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "documents_rootDocumentId_idx" ON "documents"("rootDocumentId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_rootDocumentId_fkey" FOREIGN KEY ("rootDocumentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
