-- CreateEnum
CREATE TYPE "PermitStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('pending', 'passed', 'failed', 'cancelled');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "permitId" TEXT;

-- CreateTable
CREATE TABLE "permits" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "permitType" TEXT NOT NULL,
    "permitNumber" TEXT,
    "authorityName" TEXT,
    "status" "PermitStatus" NOT NULL DEFAULT 'draft',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "expiringNotifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permit_inspections" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "permitId" TEXT NOT NULL,
    "inspectionType" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3),
    "inspectorName" TEXT,
    "inspectorContact" TEXT,
    "result" "InspectionResult" NOT NULL DEFAULT 'pending',
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permit_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "permits_companyId_idx" ON "permits"("companyId");

-- CreateIndex
CREATE INDEX "permits_projectId_idx" ON "permits"("projectId");

-- CreateIndex
CREATE INDEX "permit_inspections_companyId_idx" ON "permit_inspections"("companyId");

-- CreateIndex
CREATE INDEX "permit_inspections_permitId_idx" ON "permit_inspections"("permitId");

-- CreateIndex
CREATE INDEX "documents_permitId_idx" ON "documents"("permitId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "permits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permits" ADD CONSTRAINT "permits_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permits" ADD CONSTRAINT "permits_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permit_inspections" ADD CONSTRAINT "permit_inspections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permit_inspections" ADD CONSTRAINT "permit_inspections_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "permits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

