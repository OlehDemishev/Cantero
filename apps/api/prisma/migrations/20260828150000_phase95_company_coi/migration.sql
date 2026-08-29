-- CreateEnum
CREATE TYPE "CompanyDocumentType" AS ENUM ('general_liability_insurance', 'workers_comp_insurance', 'umbrella_insurance', 'builders_risk_insurance', 'other');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "coiPublicToken" TEXT,
ADD COLUMN     "coiPubliclyShared" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "companyDocumentId" TEXT;

-- CreateTable
CREATE TABLE "company_documents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "CompanyDocumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_documents_companyId_idx" ON "company_documents"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "companies_coiPublicToken_key" ON "companies"("coiPublicToken");

-- CreateIndex
CREATE INDEX "documents_companyDocumentId_idx" ON "documents"("companyDocumentId");

-- AddForeignKey
ALTER TABLE "company_documents" ADD CONSTRAINT "company_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_companyDocumentId_fkey" FOREIGN KEY ("companyDocumentId") REFERENCES "company_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

