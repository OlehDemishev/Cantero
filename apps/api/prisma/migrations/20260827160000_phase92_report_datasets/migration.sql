-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReportDataset" ADD VALUE 'revenue_by_month';
ALTER TYPE "ReportDataset" ADD VALUE 'project_margins';
ALTER TYPE "ReportDataset" ADD VALUE 'labor_utilization';

