-- AlterEnum
ALTER TYPE "SubcontractorDocumentType" ADD VALUE 'bonding';

-- AlterTable
ALTER TABLE "subcontractor_assignments" ADD COLUMN     "actualEndDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "subcontractors" ADD COLUMN     "bondingCapacity" DECIMAL(14,2),
ADD COLUMN     "licenseNumber" TEXT,
ADD COLUMN     "safetyProgramSummary" TEXT;

-- CreateTable
CREATE TABLE "subcontractor_performance_reviews" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedByName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "onTime" BOOLEAN,
    "safetyIncidents" INTEGER NOT NULL DEFAULT 0,
    "reworkCount" INTEGER NOT NULL DEFAULT 0,
    "wouldHireAgain" BOOLEAN,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subcontractor_performance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subcontractor_performance_reviews_companyId_idx" ON "subcontractor_performance_reviews"("companyId");

-- CreateIndex
CREATE INDEX "subcontractor_performance_reviews_subcontractorId_idx" ON "subcontractor_performance_reviews"("subcontractorId");

-- AddForeignKey
ALTER TABLE "subcontractor_performance_reviews" ADD CONSTRAINT "subcontractor_performance_reviews_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_performance_reviews" ADD CONSTRAINT "subcontractor_performance_reviews_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "subcontractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_performance_reviews" ADD CONSTRAINT "subcontractor_performance_reviews_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "subcontractor_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

