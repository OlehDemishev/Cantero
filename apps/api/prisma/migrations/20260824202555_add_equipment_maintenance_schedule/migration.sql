-- AlterTable
ALTER TABLE "equipment" ADD COLUMN     "maintenanceIntervalDays" INTEGER,
ADD COLUMN     "nextMaintenanceDueAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "equipment" ADD COLUMN     "maintenanceOverdueNotifiedAt" TIMESTAMP(3);
