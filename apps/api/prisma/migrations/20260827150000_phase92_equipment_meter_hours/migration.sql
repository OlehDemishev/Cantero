-- AlterTable
ALTER TABLE "equipment" ADD COLUMN     "currentMeterHours" DECIMAL(10,1),
ADD COLUMN     "maintenanceIntervalHours" DECIMAL(10,1),
ADD COLUMN     "maintenanceOverdueHoursNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "nextMaintenanceDueHours" DECIMAL(10,1);

-- AlterTable
ALTER TABLE "equipment_maintenance_records" ADD COLUMN     "meterHours" DECIMAL(10,1),
ADD COLUMN     "supplierId" TEXT;

-- AddForeignKey
ALTER TABLE "equipment_maintenance_records" ADD CONSTRAINT "equipment_maintenance_records_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

