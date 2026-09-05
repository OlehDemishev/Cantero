-- CreateEnum
CREATE TYPE "PrequalificationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "CylinderBreakResult" AS ENUM ('pass', 'fail');

-- CreateTable
CREATE TABLE "subcontractor_prequalifications" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "licenseNumber" TEXT,
    "bondingCapacity" DECIMAL(14,2),
    "yearsInBusiness" INTEGER,
    "safetyEmrRating" DECIMAL(4,2),
    "referencesNotes" TEXT,
    "score" INTEGER,
    "status" "PrequalificationStatus" NOT NULL DEFAULT 'pending',
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subcontractor_prequalifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calibration_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "toolCribItemId" TEXT,
    "equipmentId" TEXT,
    "calibratedAt" TIMESTAMP(3) NOT NULL,
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "certificateNumber" TEXT,
    "performedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calibration_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concrete_pours" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "pourDate" TIMESTAMP(3) NOT NULL,
    "mixDesign" TEXT,
    "volume" DECIMAL(10,2),
    "specifiedStrength" DECIMAL(10,2),
    "specifiedSlump" DECIMAL(6,2),
    "supplierName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concrete_pours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slump_tests" (
    "id" TEXT NOT NULL,
    "pourId" TEXT NOT NULL,
    "testedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slumpValue" DECIMAL(6,2) NOT NULL,
    "withinSpec" BOOLEAN NOT NULL,
    "testedByName" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "slump_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cylinder_breaks" (
    "id" TEXT NOT NULL,
    "pourId" TEXT NOT NULL,
    "cylinderLabel" TEXT NOT NULL,
    "breakAgeDays" INTEGER NOT NULL,
    "breakDate" TIMESTAMP(3) NOT NULL,
    "breakStrength" DECIMAL(10,2),
    "result" "CylinderBreakResult",
    "testedByName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cylinder_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subcontractor_prequalifications_companyId_idx" ON "subcontractor_prequalifications"("companyId");

-- CreateIndex
CREATE INDEX "subcontractor_prequalifications_subcontractorId_idx" ON "subcontractor_prequalifications"("subcontractorId");

-- CreateIndex
CREATE INDEX "calibration_records_companyId_idx" ON "calibration_records"("companyId");

-- CreateIndex
CREATE INDEX "calibration_records_toolCribItemId_idx" ON "calibration_records"("toolCribItemId");

-- CreateIndex
CREATE INDEX "calibration_records_equipmentId_idx" ON "calibration_records"("equipmentId");

-- CreateIndex
CREATE INDEX "concrete_pours_companyId_idx" ON "concrete_pours"("companyId");

-- CreateIndex
CREATE INDEX "concrete_pours_projectId_idx" ON "concrete_pours"("projectId");

-- CreateIndex
CREATE INDEX "slump_tests_pourId_idx" ON "slump_tests"("pourId");

-- CreateIndex
CREATE INDEX "cylinder_breaks_pourId_idx" ON "cylinder_breaks"("pourId");

-- AddForeignKey
ALTER TABLE "subcontractor_prequalifications" ADD CONSTRAINT "subcontractor_prequalifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_prequalifications" ADD CONSTRAINT "subcontractor_prequalifications_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "subcontractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_toolCribItemId_fkey" FOREIGN KEY ("toolCribItemId") REFERENCES "tool_crib_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concrete_pours" ADD CONSTRAINT "concrete_pours_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concrete_pours" ADD CONSTRAINT "concrete_pours_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slump_tests" ADD CONSTRAINT "slump_tests_pourId_fkey" FOREIGN KEY ("pourId") REFERENCES "concrete_pours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cylinder_breaks" ADD CONSTRAINT "cylinder_breaks_pourId_fkey" FOREIGN KEY ("pourId") REFERENCES "concrete_pours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

