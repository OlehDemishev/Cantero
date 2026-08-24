-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "isRetainageRelease" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "percentComplete" DECIMAL(5,2),
ADD COLUMN     "retainageAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "retainagePercent" DECIMAL(5,2);
