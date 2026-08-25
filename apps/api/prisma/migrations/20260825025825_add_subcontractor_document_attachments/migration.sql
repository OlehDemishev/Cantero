-- AlterEnum
ALTER TYPE "DocumentCategory" ADD VALUE 'insurance_certificate';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "subcontractorDocumentId" TEXT;

-- CreateIndex
CREATE INDEX "documents_subcontractorDocumentId_idx" ON "documents"("subcontractorDocumentId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_subcontractorDocumentId_fkey" FOREIGN KEY ("subcontractorDocumentId") REFERENCES "subcontractor_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

