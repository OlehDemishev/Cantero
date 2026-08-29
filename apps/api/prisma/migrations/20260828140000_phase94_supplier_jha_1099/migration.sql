-- CreateEnum
CREATE TYPE "SupplierDocumentType" AS ENUM ('general_liability_insurance', 'workers_comp_insurance', 'other');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "supplierDocumentId" TEXT;

-- AlterTable
ALTER TABLE "subcontractors" ADD COLUMN     "legalBusinessName" TEXT,
ADD COLUMN     "mailingAddress" TEXT,
ADD COLUMN     "taxId" TEXT;

-- CreateTable
CREATE TABLE "supplier_documents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "type" "SupplierDocumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_reviews" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedByName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "wouldReorder" BOOLEAN,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontractor_payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "subcontractorCostId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subcontractor_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_hazard_analyses" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "taskDescription" TEXT NOT NULL,
    "hazards" TEXT NOT NULL,
    "controlMeasures" TEXT NOT NULL,
    "requiredPpe" TEXT,
    "conductedByUserId" TEXT,
    "conductedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_hazard_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jha_acknowledgments" (
    "id" TEXT NOT NULL,
    "jhaId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jha_acknowledgments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_documents_companyId_idx" ON "supplier_documents"("companyId");

-- CreateIndex
CREATE INDEX "supplier_documents_supplierId_idx" ON "supplier_documents"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_reviews_companyId_idx" ON "supplier_reviews"("companyId");

-- CreateIndex
CREATE INDEX "supplier_reviews_supplierId_idx" ON "supplier_reviews"("supplierId");

-- CreateIndex
CREATE INDEX "subcontractor_payments_companyId_idx" ON "subcontractor_payments"("companyId");

-- CreateIndex
CREATE INDEX "subcontractor_payments_subcontractorId_idx" ON "subcontractor_payments"("subcontractorId");

-- CreateIndex
CREATE INDEX "subcontractor_payments_subcontractorCostId_idx" ON "subcontractor_payments"("subcontractorCostId");

-- CreateIndex
CREATE INDEX "subcontractor_payments_paidAt_idx" ON "subcontractor_payments"("paidAt");

-- CreateIndex
CREATE INDEX "job_hazard_analyses_companyId_idx" ON "job_hazard_analyses"("companyId");

-- CreateIndex
CREATE INDEX "job_hazard_analyses_projectId_idx" ON "job_hazard_analyses"("projectId");

-- CreateIndex
CREATE INDEX "job_hazard_analyses_taskId_idx" ON "job_hazard_analyses"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "jha_acknowledgments_jhaId_workerId_key" ON "jha_acknowledgments"("jhaId", "workerId");

-- CreateIndex
CREATE INDEX "documents_supplierDocumentId_idx" ON "documents"("supplierDocumentId");

-- AddForeignKey
ALTER TABLE "supplier_documents" ADD CONSTRAINT "supplier_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_documents" ADD CONSTRAINT "supplier_documents_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_reviews" ADD CONSTRAINT "supplier_reviews_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_reviews" ADD CONSTRAINT "supplier_reviews_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_payments" ADD CONSTRAINT "subcontractor_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_payments" ADD CONSTRAINT "subcontractor_payments_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "subcontractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_payments" ADD CONSTRAINT "subcontractor_payments_subcontractorCostId_fkey" FOREIGN KEY ("subcontractorCostId") REFERENCES "subcontractor_costs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_supplierDocumentId_fkey" FOREIGN KEY ("supplierDocumentId") REFERENCES "supplier_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_hazard_analyses" ADD CONSTRAINT "job_hazard_analyses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_hazard_analyses" ADD CONSTRAINT "job_hazard_analyses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_hazard_analyses" ADD CONSTRAINT "job_hazard_analyses_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jha_acknowledgments" ADD CONSTRAINT "jha_acknowledgments_jhaId_fkey" FOREIGN KEY ("jhaId") REFERENCES "job_hazard_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jha_acknowledgments" ADD CONSTRAINT "jha_acknowledgments_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

