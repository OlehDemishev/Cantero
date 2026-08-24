-- CreateEnum
CREATE TYPE "SubcontractorDocumentType" AS ENUM ('general_liability_insurance', 'workers_comp_insurance', 'license', 'other');

-- CreateTable
CREATE TABLE "subcontractor_documents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "type" "SubcontractorDocumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subcontractor_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subcontractor_documents_companyId_idx" ON "subcontractor_documents"("companyId");

-- CreateIndex
CREATE INDEX "subcontractor_documents_subcontractorId_idx" ON "subcontractor_documents"("subcontractorId");

-- AddForeignKey
ALTER TABLE "subcontractor_documents" ADD CONSTRAINT "subcontractor_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_documents" ADD CONSTRAINT "subcontractor_documents_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "subcontractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
