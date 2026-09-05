-- CreateEnum
CREATE TYPE "EstimateAlternateStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "SubcontractorDiversityCategory" AS ENUM ('mbe', 'wbe', 'dbe', 'vbe', 'sdvosb', 'other');

-- AlterTable
ALTER TABLE "subcontractors" ADD COLUMN     "diversityCertificationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "diversityCertifications" "SubcontractorDiversityCategory"[] DEFAULT ARRAY[]::"SubcontractorDiversityCategory"[];

-- CreateTable
CREATE TABLE "estimate_alternates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "EstimateAlternateStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "estimate_alternates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estimate_alternates_companyId_idx" ON "estimate_alternates"("companyId");

-- CreateIndex
CREATE INDEX "estimate_alternates_estimateId_idx" ON "estimate_alternates"("estimateId");

-- AddForeignKey
ALTER TABLE "estimate_alternates" ADD CONSTRAINT "estimate_alternates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_alternates" ADD CONSTRAINT "estimate_alternates_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

