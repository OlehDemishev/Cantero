-- AlterEnum
ALTER TYPE "ChecklistTemplateType" ADD VALUE 'jha';

-- AlterEnum
ALTER TYPE "EquipmentStatus" ADD VALUE 'rented_out';

-- AlterTable
ALTER TABLE "checklist_templates" ADD COLUMN     "defaultControlMeasures" TEXT,
ADD COLUMN     "defaultHazards" TEXT,
ADD COLUMN     "defaultPpe" TEXT;

-- CreateTable
CREATE TABLE "equipment_rentals" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "renterName" TEXT NOT NULL,
    "renterContact" TEXT,
    "dailyRate" DECIMAL(12,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturnDate" TIMESTAMP(3),
    "actualReturnDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_rentals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipment_rentals_companyId_idx" ON "equipment_rentals"("companyId");

-- CreateIndex
CREATE INDEX "equipment_rentals_equipmentId_idx" ON "equipment_rentals"("equipmentId");

-- AddForeignKey
ALTER TABLE "equipment_rentals" ADD CONSTRAINT "equipment_rentals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_rentals" ADD CONSTRAINT "equipment_rentals_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

