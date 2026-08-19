-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "hourlyCostSnapshot" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "workers" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;
